import init from "./wasm/wasm_game_of_life.js";

async function run() {
  // Load the WASM so we can use the functions defined therein
  let wasm = await init();

  // Grab the canvas & context
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2");

  // Shaders
  let vertex_shader = createShader(gl, gl.VERTEX_SHADER, vertex_shader_source);
  let fragment_shader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragment_shader_source,
  );

  // Program
  let program = createProgram(gl, vertex_shader, fragment_shader);
  gl.useProgram(program);

  // Clear the canvas
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Set Uniforms
  updateResolutionUniform(gl, program);

  // We just draw one triangle
  canvasResize(gl, program);
  renderLoop(gl, program);

  // Add listener to update the canvas on window resize
  window.addEventListener("resize", () => {
    canvasResize(gl, program);
    draw(gl);
  });
}

let paused = false;
let start_time = Date.now();
let last_tick_time = Date.now();
function renderLoop(gl, program) {
  let current_time = Date.now();
  let time_elapsed = current_time - start_time;
  let time_elapsed_since_last_tick = current_time - last_tick_time;

  if (!paused && time_elapsed_since_last_tick > 500) {
    updateTimeUniform(gl, program, time_elapsed);
    draw(gl);
    last_tick_time = current_time;
  }
  requestAnimationFrame(() => {
    renderLoop(gl, program);
  });
}

function canvasResize(gl, program) {
  resizeCanvasToDisplaySize(gl);
  updateResolutionUniform(gl, program);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function updateResolutionUniform(gl, program) {
  const res_location = gl.getUniformLocation(program, "resolution");
  gl.uniform2f(res_location, gl.canvas.width, gl.canvas.height);
}

function updateTimeUniform(gl, program, secs_elapsed) {
  const time_location = gl.getUniformLocation(program, "time");
  gl.uniform1f(time_location, secs_elapsed);
}

function draw(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function resizeCanvasToDisplaySize(gl) {
  const canvas = gl.canvas;
  // Lookup the size the browser is displaying the canvas in CSS pixels
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  // Check if the canvas is not the same size.
  const needResize =
    canvas.width !== displayWidth || canvas.height !== displayHeight;

  if (needResize) {
    // Make the canvas the same size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return needResize;
}

const vertex_shader_source = `#version 300 es
        in vec4 position;
        out vec2 texcoords; // [0,1] st coordinates 

        void main() {
            vec2 vertices[3]=vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1, 3));
            gl_Position = vec4(vertices[gl_VertexID],0,1);
            texcoords = 0.5 * gl_Position.xy + vec2(0.5);
        }
`;

const fragment_shader_source = `#version 300 es 
precision highp float;

#define PI 3.1415926535
#define DEFAULT_RAY_ORIGIN  vec3(0.0, 0.0, -2.0)

// The size of the screen in pixels
uniform vec2 resolution;
// Elapsed time in miliseconds 
uniform float time;

///////////
// SETUP //
///////////

// Blocks are 4x the size of the space between them
#define GUTTER_RATIO 4.0
// Corners of blocks are rounded at 25%
#define ROUNDING_RATIO 0.25
// The minimum grid size in either (x,y) direction
#define GRID_MIN_DIMENSION 16.0

// Spacing between blocks (will be updated)
float GRID_GUTTER_SIZE = 1.0;
// Half the side length of a cube (will be updated)
float BLOCK_SIZE = 0.5;
// How the corners and edges of the boxes are rounds (will be updated)
float BLOCK_ROUNDING = 0.1;
// How many blocks in each dimension (will be updated)
vec3 GRID_DIMENSIONS = vec3(GRID_MIN_DIMENSION, GRID_MIN_DIMENSION, 1.0);
// Sets up the number of blocks to fill the screen, and meet
// the minimum # of blocks requirement. 'ratio' is the x/y resolution ratio.
void set_grid_dimensions(float ratio) {
  float nom = 2.0; // Fill the view box from [-1,1]
  // Screen needs to fit N blocks and N+1 gutters
  float denom = (GRID_MIN_DIMENSION + 1.0) + (GUTTER_RATIO * GRID_MIN_DIMENSION);

  // Wide Screen
  if (ratio > 1.0) { 
    GRID_DIMENSIONS.x = round(ratio * GRID_MIN_DIMENSION);
    // Formula requires an even number of squares
    GRID_DIMENSIONS.x -= float(int(GRID_DIMENSIONS.x) % 2);
  } else if (ratio < 1.0) { // Tall Screen
    nom *= ratio; // Adjust by ratio if the ratio is < 1
    GRID_DIMENSIONS.y = round((1.0/ratio) * GRID_MIN_DIMENSION);
    // Formula requires an even number of squares
    GRID_DIMENSIONS.y -= float(int(GRID_DIMENSIONS.y) % 2);
  }
  BLOCK_SIZE = (nom * GUTTER_RATIO) / denom;
  BLOCK_ROUNDING = BLOCK_SIZE * ROUNDING_RATIO;
  GRID_GUTTER_SIZE = nom / denom;
}

struct Ray {
  vec3 ro; // Ray Origin
  vec3 rd; // Ray Direction
};

// Generates a ray direction from fragment coordinates
Ray generatePerspectiveRay(vec2 resolution, vec2 fragCoord) {
  // Normalized Coordinates [-1,1]
  vec2 st = ((gl_FragCoord.xy * 2.0) - resolution.xy) / resolution.y;
  // Ray Origin
  vec3 ro = DEFAULT_RAY_ORIGIN;
  // Ray Direction (+z is "into the screen")
  vec3 rd = normalize(vec3(st, 1));
  return Ray(ro, rd);
}

// An "Object" in our scene
struct SceneObj {
  // How far the object is from the ray origin
  float dist;
  // Type of Object determines it material
  // -1 -> Nothing
  //  0 -> Ground Plane
  //  1 -> Block
  int type;
  // Each block has a unique ID to identify it
  int id;
};

// SDF for a Rounded Rectangle
float sdRoundBox(vec3 p) {
  vec3 b = vec3(BLOCK_SIZE);
  vec3 q = abs(p) - b + BLOCK_ROUNDING;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - BLOCK_ROUNDING;
}

// Repeat an SDF Rounded Rect Every 's' units
// Stops repeating after 'size' repetitions in 
// each dimension. *ONLY WORKS FOR EVEN NUMBERS*
vec2 limited_repeated(vec3 p, vec3 size, float s) {
  p += BLOCK_SIZE;
  vec3 id = round(p / s);
  vec3  o = sign(p - s * id);
  float d = 1e20;
  int index = 0;
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++)
    {
      vec3 rid = id + vec3(i, j, 0) * o;
      // limited repetition
      rid = clamp(rid, -(size - 2.0) * 0.5, (size - 0.0) * 0.5);
      vec3 r = p - s * rid;
      int z = int(round(rid.x)) * int(round(rid.y));
      int t = (int(time / 1000.) % 32) + 1;
      if (z % t == 0) {
        r.z -= 0.05;
      }
      float x = sdRoundBox(r);

      if (x < d) {
        d = x;

        index = int(round(rid.x)) * int(round(rid.y));
      }
    }
  return vec2(d,index);
}

// Returns the distance to closest block to point 'p' in the 
// grid of blocks.
vec2 gol_grid_distance(vec3 p) {
  float spacing = 2.0 * BLOCK_SIZE + GRID_GUTTER_SIZE;
  // Add the block size to the point to center it
  p += BLOCK_SIZE;
  vec3 id = round(p / spacing);
  vec3  o = sign(p - spacing * id);
  float d = 1e20;
  int index = 0;
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++)
    {
      vec3 rid = id + vec3(i, j, 0) * o;
      // limited repetition
      rid = clamp(rid, -(GRID_DIMENSIONS - 2.0) * 0.5, (GRID_DIMENSIONS - 0.0) * 0.5);
      vec3 r = p - spacing * rid;
      int z = int(round(rid.x)) * int(round(rid.y));
      int t = (int(time / 1000.) % 32) + 1;
      if (z % t == 0) {
        r.z -= 0.05;
      }
      float x = sdRoundBox(r); 

      if (x < d) {
        d = x;

        index = int(round(rid.x)) * int(round(rid.y));
      }
    }
  return vec2(d,index);
}

// Distance from the ground plane
#define GROUND_PLANE_LOCATION 0.0
float ground_plane_distance(vec3 p) {
  return abs(p.z - GROUND_PLANE_LOCATION);
}

// Closest object in the scene, from point 'p'
SceneObj sceneSDF(vec3 p) {
  float ground_distance = ground_plane_distance(p);
  // (distance, block_id)
  vec2 grid = gol_grid_distance(p);
  float grid_distance = grid.x;
  int grid_id = int(grid.y);
  
  if (ground_distance < grid_distance) {
      return SceneObj(ground_distance, 0, 0);
  } else if (grid_distance < ground_distance) {
      return SceneObj(grid_distance, 1, grid_id);
  }
}

#define MAX_STEPS 300
// If our step is below this, we end the march
#define MARCH_ACCURACY 1e-5
// Beyond this distance we stop the march
#define MAX_MARCH_DISTANCE 1e+5
SceneObj ray_march(Ray ray) {
    float distance = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      // Find the closest object to the ray
	  SceneObj object = sceneSDF(ray.ro + distance * ray.rd);
	  if (object.dist <= MARCH_ACCURACY) {
        // We're done, return the object
	    return SceneObj(distance, object.type, object.id);
	  } else if (distance > MAX_MARCH_DISTANCE) { // Gone too far
	    return SceneObj(MAX_MARCH_DISTANCE,-1,-1);
	  } else {
        // Move forward with the search 
	    distance += object.dist;
      }
    }
    // If Never hit anything
    return SceneObj(MAX_MARCH_DISTANCE,-1,-1);
}

// Cook-Torrance BRDF Material Model
struct PBRMat {
  vec3 color;
  float roughness;
  float metallic;
  float ao;
};

// Get the distance from an object to a point
float getObjectSD(int type, int id, vec3 p) {
  if (type == 0) { return ground_plane_distance(p); }
  else if (type == 1) { return gol_grid_distance(p).x; } // returns: vec2(distance, id_of_block)
  return MAX_MARCH_DISTANCE;
}

// This could be made better since most of the blocks are flat/have trivial normals
// Approximates a normal vector using SDF
#define EPS_GRAD 0.001
vec3 computeSDFGrad(SceneObj is, vec3 p) {
    vec3 p_x_p = p + vec3(EPS_GRAD, 0, 0);
    vec3 p_x_m = p - vec3(EPS_GRAD, 0, 0);
    vec3 p_y_p = p + vec3(0, EPS_GRAD, 0);
    vec3 p_y_m = p - vec3(0, EPS_GRAD, 0);
    vec3 p_z_p = p + vec3(0, 0, EPS_GRAD);
    vec3 p_z_m = p - vec3(0, 0, EPS_GRAD);

    float sdf_x_p = getObjectSD(is.type,is.id,p_x_p);
    float sdf_x_m = getObjectSD(is.type,is.id,p_x_m);
    float sdf_y_p = getObjectSD(is.type,is.id,p_y_p);
    float sdf_y_m = getObjectSD(is.type,is.id,p_y_m);
    float sdf_z_p = getObjectSD(is.type,is.id,p_z_p);
    float sdf_z_m = getObjectSD(is.type,is.id,p_z_m);

    return vec3(sdf_x_p - sdf_x_m
	        ,sdf_y_p - sdf_y_m
	        ,sdf_z_p - sdf_z_m) / (2.0 * EPS_GRAD);
}

// Where a ray of light has struck an object
struct Surface {
  vec3 p; // position
  vec3 n; // surface normal
  PBRMat mat; // material
};

#define NUM_LIGHTS 2
struct Light 
{
    int type; // 0 dir light, 1 point light
    vec3 dir; // directionnal light
    vec3 center; // point light
    float intensity; // 1 default
    vec3 color; // light color
};
Ray light_ray(vec3 ro, Light l) //computes ro to light source ray
{
    if(l.type == 0)
        return Ray(ro,normalize(l.dir));
    else if(l.type == 1)
        return Ray(ro,normalize(l.center - ro));

    return Ray(ro,vec3(1));
}

float light_dist(vec3 ro, Light l) //computes distance to light
{ 
    if(l.type == 0)
         return MAX_MARCH_DISTANCE;
    else if(l.type == 1)
        return length(l.center - ro);

    return MAX_MARCH_DISTANCE;
}

Light lights[2] = Light[2](Light(0,vec3(0,0,-1),vec3(0.0,0.0,-1.0), 1.,vec3(1.,1.,1.)), Light(1,vec3(0),vec3(0.0,0.0,-1.0),100.,vec3(1.)));

float DistributionGGX(vec3 N, vec3 H, float roughness)
{
    float a      = roughness*roughness;
    float a2     = a*a;
    float NdotH  = max(dot(N, H), 0.0);
    float NdotH2 = NdotH*NdotH;

    float nom   = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return nom / denom;
}

float GeometrySchlickGGX(float NdotV, float roughness)
{
    float r = (roughness + 1.0);
    float k = (r*r) / 8.0;

    float nom   = NdotV;
    float denom = NdotV * (1.0 - k) + k;

    return nom / denom;
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness)
{
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2  = GeometrySchlickGGX(NdotV, roughness);
    float ggx1  = GeometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
}

vec3 fresnelSchlick(float cosTheta, vec3 F0)
{
    return F0 + (1.0 - F0)*pow((1.0 + 0.000001/*avoid negative approximation when cosTheta = 1*/) - cosTheta, 5.0);
}

vec3 computeReflectance(vec3 N, vec3 Ve, vec3 F0, vec3 albedo, vec3 L, vec3 H, vec3 light_col, float intensity, float metallic, float roughness) {
    vec3 radiance =  light_col * intensity; //Incoming Radiance

    // cook-torrance brdf
    float NDF = DistributionGGX(N, H, roughness);
    float G   = GeometrySmith(N, Ve, L,roughness);
    vec3 F    = fresnelSchlick(max(dot(H, Ve), 0.0), F0);

    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallic;

    vec3 nominator    = NDF * G * F;
    float denominator = 4.0 * max(dot(N, Ve), 0.0) * max(dot(N, L), 0.0) + 0.00001/* avoid divide by zero*/;
    vec3 specular     = nominator / denominator;


    // add to outgoing radiance Lo
    float NdotL = max(dot(N, L), 0.0);
    vec3 diffuse_radiance = kD * (albedo)/ PI;

    return (diffuse_radiance + specular) * radiance * NdotL;
}


vec3 PBR(in Surface hit, in Ray r , in Light l)
{
    vec3 ambient = vec3(0.03) * hit.mat.color * (1.0 - hit.mat.ao);
    //Average F0 for dielectric materials
    vec3 F0 = vec3(0.04);
    // Get Proper F0 if material is not dielectric
    F0 = mix(F0, hit.mat.color, hit.mat.metallic);
    vec3 N = normalize(hit.n);
    vec3 Ve = normalize(r.ro - hit.p);

    float intensity = 1.0f;
    if(l.type == 1)
    {
        float l_dist = light_dist(hit.p,l);
        intensity = l.intensity/(l_dist*l_dist);
    }
    vec3 l_dir = light_ray(hit.p,l).rd;
    vec3 H = normalize(Ve + l_dir);
    return ambient + computeReflectance(N,Ve,F0,hit.mat.color,l_dir,H,l.color,intensity,hit.mat.metallic,hit.mat.roughness);
}



vec3 direct_illumination(Surface s, Ray r, float rc) {
    vec3 color = vec3(0);
    for(int i = 0 ; i < NUM_LIGHTS ; i++) {
	Ray l_ray = light_ray(s.p, lights[i]);
	l_ray.ro = s.p + 0.01*s.n;
	SceneObj io;

	io = ray_march(l_ray);
	
	float d_light = light_dist(s.p,lights[i]);

	if(io.type < 0 || (io.type >= 0 && (io.dist >= d_light))) {
	    color += PBR(s,r,lights[i]);
	} else {
	    color +=  vec3(0.03) * s.mat.color * s.mat.ao;
	}


	vec3 Ve = normalize(r.ro - s.p);
	vec3 H = normalize(Ve + l_ray.rd);
	rc = length(fresnelSchlick(max(dot(H, Ve), 0.0),  mix(vec3(0.04), s.mat.color, s.mat.metallic)))*s.mat.ao;
    }

    return color;
}

#define NUM_REFLECTIONS 1
#define REFLECTION_COEFFICIENT 0.3
vec3 march(Ray r) {
  vec3 accum = vec3(0);
  vec3 mask = vec3(1);
  
  Ray curr_ray = r;
  for(int i = 0; i <= NUM_REFLECTIONS; i++) {
    SceneObj object = ray_march(curr_ray);
    // If the ray hit an object
    if (object.type > 0) {
      // Generate a 'surface' for the hit object
      vec3 position = curr_ray.ro + object.dist * curr_ray.rd;
      PBRMat material = PBRMat(vec3(0.8,0.8,0.1), 0.5, 0.9, 0.5);
      int t = (int(time / 1000.) % 32) + 1;
      if (object.id % t == 0) {
        material = PBRMat(vec3(1.0, 1.0, 1.0), 0.5, 0.1, 0.5);
      }
      vec3 normal = normalize(computeSDFGrad(object, position));
      Surface surface = Surface(position, normal, material);
      
      // Calculate the color of the surface
      vec3 color = direct_illumination(surface, curr_ray, REFLECTION_COEFFICIENT);
      accum = accum + mask * color;
      mask = mask * REFLECTION_COEFFICIENT;
      
      // Update the ray
      curr_ray  = Ray(surface.p + 0.05*surface.n, reflect(curr_ray.rd,surface.n));
    } else if(i==0){
        accum = vec3(0.55);
    }
  }
    
  //HDR
  accum = accum / (accum+ vec3(1.0));
  //Gamma
  float gamma = 1.1;
  accum = pow(accum, vec3(1.0/gamma));

  return accum; 
}







in vec2 texcoords;
out vec4 fragColor;


void main() {
  // Set the grid dimensions (number of blocks for the GOL)
  // Such that they fill the user's screen.
  set_grid_dimensions(resolution.x/resolution.y);
  
  // Ray Marching
  Ray ray = generatePerspectiveRay(resolution.xy, gl_FragCoord.xy);
  // Output Color
  vec3 color = march(ray);
  fragColor = vec4(color, 1);
}

`;

// Compile Shaders
function createShader(gl, type, source) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }

  console.warn(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

function createProgram(gl, vertexShader, fragmentShader) {
  var program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  var success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }

  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

// Let the show begin!
run();

// Set constants for the grid's display
// const CELL_SIZE = 5;
// const GRID_COLOR = "#CCCCCC";
// const ALIVE_COLOR = "#000000";
// const DEAD_COLOR = "#FFFFFF";

// Create a new universe in WASM memory
// const universe = Universe.new(60, 60);
// const width = universe.width();
// const height = universe.height();

// Grab & Initialize canvas + context
// const canvas = document.getElementById("game-of-life-canvas");
// const ctx = canvas.getContext("2d");
// canvas.height = (CELL_SIZE + 1) * (height + 1);
// canvas.width = (CELL_SIZE + 1) * (width + 1);
// // Toggle on click
// canvas.addEventListener("click", (event) => {
//   const boundingRect = canvas.getBoundingClientRect();
//
//   const scaleX = canvas.width / boundingRect.width;
//   const scaleY = canvas.height / boundingRect.height;
//
//   const canvasLeft = (event.clientX - boundingRect.left) * scaleX;
//   const canvasTop = (event.clientY - boundingRect.top) * scaleY;
//
//   const row = Math.min(Math.floor(canvasTop / (CELL_SIZE + 1)), height - 1);
//   const col = Math.min(Math.floor(canvasLeft / (CELL_SIZE + 1)), width - 1);
//
//   universe.toggle_cell(row, col);
//
//   drawGrid();
//   drawCells();
// });
//
// Main Render Loop
//   let paused = false;
//   let last_tick_time = new Date();
//   document.onkeypress = (event) => {
//     if (event.code == "Space") {
//       paused = !paused;
//     } else if (event.code == "Digit1") {
//       console.log("girls");
//       universe.all_alive();
//       drawGrid();
//       drawCells();
//     } else if (event.code == "Digit0") {
//       console.log("gay");
//       universe.all_dead();
//       drawGrid();
//       drawCells();
//     }
//   };
//   const renderLoop = () => {
//     let current_time = new Date();
//     let time_elapsed = current_time - last_tick_time;
//
//     if (!paused && time_elapsed > 500) {
//       universe.tick();
//       drawGrid();
//       drawCells();
//       last_tick_time = current_time;
//     }
//
//     requestAnimationFrame(renderLoop);
//   };
//
//   const drawGrid = () => {
//     ctx.beginPath();
//     ctx.strokeStyle = GRID_COLOR;
//     // Vertical lines.
//     for (let i = 0; i <= width; i++) {
//       ctx.moveTo(i * (CELL_SIZE + 1) + 1, 0);
//       ctx.lineTo(i * (CELL_SIZE + 1) + 1, (CELL_SIZE + 1) * height + 1);
//     }
//
//     // Horizontal lines.
//     for (let j = 0; j <= height; j++) {
//       ctx.moveTo(0, j * (CELL_SIZE + 1) + 1);
//       ctx.lineTo((CELL_SIZE + 1) * width + 1, j * (CELL_SIZE + 1) + 1);
//     }
//
//     ctx.stroke();
//   };
//
//   // Get linear index of a cell's position in a 2D universe
//   const getIndex = (row, column) => {
//     return row * width + column;
//   };
//
//   const drawCells = () => {
//     const cellsPtr = universe.cells();
//     const cells = new Uint8Array(wasm.memory.buffer, cellsPtr, width * height);
//
//     ctx.beginPath();
//
//     for (let row = 0; row < height; row++) {
//       for (let col = 0; col < width; col++) {
//         const idx = getIndex(row, col);
//
//         ctx.fillStyle = cells[idx] === Cell.Dead ? DEAD_COLOR : ALIVE_COLOR;
//
//         ctx.fillRect(
//           col * (CELL_SIZE + 1) + 1,
//           row * (CELL_SIZE + 1) + 1,
//           CELL_SIZE,
//           CELL_SIZE,
//         );
//       }
//     }
//
//     ctx.stroke();
//   };
//
//   // Kick off the animation
//   requestAnimationFrame(renderLoop);
// }
//
