mod utils;
use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext, WebGlProgram, WebGlShader};

// Log to JS Console in a Browser
#[allow(unused_macros)]
macro_rules! log {
    ( $( $t:tt )* ) => {
        web_sys::console::log_1(&format!( $( $t )* ).into());
    }
}

fn get_html_render_context(
    canvas_id: &str,
) -> Result<(HtmlCanvasElement, WebGl2RenderingContext), JsValue> {
    // Grab the background canvas HTML element
    let window = web_sys::window().expect("No Window Element");
    let document = window.document().expect("No Document Element");
    let canvas = document
        .get_element_by_id(canvas_id)
        .expect("No Canvas Element");
    let canvas: web_sys::HtmlCanvasElement = canvas.dyn_into::<web_sys::HtmlCanvasElement>()?;
    let context = canvas
        .get_context("webgl2")?
        .expect("WebGL2 Not Supported")
        .dyn_into::<WebGl2RenderingContext>()?;
    Ok((canvas, context))
}

const VERT_SHADER_GLSL: &str = r##"#version 300 es
 
        in vec4 position;
        out vec2 texcoords; // [0,1] st coordinates 

        void main() {
            vec2 vertices[3]=vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1, 3));
            gl_Position = vec4(vertices[gl_VertexID],0,1);
            texcoords = 0.5 * gl_Position.xy + vec2(0.5);
        }
"##;

const FRAG_SHADER_GLSL: &str = r##"#version 300 es 
    
        precision highp float;

        out vec4 outColor;
        in vec2 texcoords;

        uniform uint width;
        uniform unit height;
        
        void main() {
            outColor = vec4(texcoords, 0, 1);
        }
"##;

#[wasm_bindgen(start)]
fn start() -> Result<(), JsValue> {
    // Canvas
    let (canvas, context) = get_html_render_context("canvas")?;

    // Shaders
    let vert_shader = compile_shader(
        &context,
        WebGl2RenderingContext::VERTEX_SHADER,
        VERT_SHADER_GLSL,
    )?;

    let frag_shader = compile_shader(
        &context,
        WebGl2RenderingContext::FRAGMENT_SHADER,
        FRAG_SHADER_GLSL,
    )?;

    // Program
    let program = link_program(&context, &vert_shader, &frag_shader)?;
    context.use_program(Some(&program));

    // Draw Call
    draw(&context, 3_i32);
    Ok(())

    // let vertices: [f32; 9] = [-0.7, -0.7, 0.0, 0.7, -0.7, 0.0, 0.0, 0.7, 0.0];
    //
    // let position_attribute_location = context.get_attrib_location(&program, "position");
    // let buffer = context.create_buffer().ok_or("Failed to create buffer")?;
    // context.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));

    // Note that `Float32Array::view` is somewhat dangerous (hence the
    // `unsafe`!). This is creating a raw view into our module's
    // `WebAssembly.Memory` buffer, but if we allocate more pages for ourself
    // (aka do a memory allocation in Rust) it'll cause the buffer to change,
    // causing the `Float32Array` to be invalid.
    //
    // As a result, after `Float32Array::view` we have to be very careful not to
    // do any memory allocations before it's dropped.
    // unsafe {
    //     let positions_array_buf_view = js_sys::Float32Array::view(&vertices);
    //
    //     context.buffer_data_with_array_buffer_view(
    //         WebGl2RenderingContext::ARRAY_BUFFER,
    //         &positions_array_buf_view,
    //         WebGl2RenderingContext::STATIC_DRAW,
    //     );
    // }
    //
    // let vao = context
    //     .create_vertex_array()
    //     .ok_or("Could not create vertex array object")?;
    // context.bind_vertex_array(Some(&vao));
    //
    // context.vertex_attrib_pointer_with_i32(
    //     position_attribute_location as u32,
    //     3,
    //     WebGl2RenderingContext::FLOAT,
    //     false,
    //     0,
    //     0,
    // );
    // context.enable_vertex_attrib_array(position_attribute_location as u32);
    //
    // context.bind_vertex_array(Some(&vao));
    //
    // let vert_count = (vertices.len() / 3) as i32;
}

fn draw(context: &WebGl2RenderingContext, vert_count: i32) {
    context.clear_color(0.0, 0.0, 0.0, 1.0);
    context.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

    context.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, vert_count);
}

pub fn compile_shader(
    context: &WebGl2RenderingContext,
    shader_type: u32,
    source: &str,
) -> Result<WebGlShader, String> {
    let shader = context
        .create_shader(shader_type)
        .ok_or_else(|| String::from("Unable to create shader object"))?;
    context.shader_source(&shader, source);
    context.compile_shader(&shader);

    if context
        .get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(context
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| String::from("Unknown error creating shader")))
    }
}

pub fn link_program(
    context: &WebGl2RenderingContext,
    vert_shader: &WebGlShader,
    frag_shader: &WebGlShader,
) -> Result<WebGlProgram, String> {
    let program = context
        .create_program()
        .ok_or_else(|| String::from("Unable to create shader object"))?;

    context.attach_shader(&program, vert_shader);
    context.attach_shader(&program, frag_shader);
    context.link_program(&program);

    if context
        .get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(context
            .get_program_info_log(&program)
            .unwrap_or_else(|| String::from("Unknown error creating program object")))
    }
}
