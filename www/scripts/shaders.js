// SDF Functions
const frag_sdf_source = `
// SDF for a Rounded Rectangle
float sdRoundBox(vec3 p) {
  vec3 b = vec3(BLOCK_SIZE);
  vec3 q = abs(p) - b + BLOCK_ROUNDING;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - BLOCK_ROUNDING;
}

int calculateCellIndex(ivec2 id) {
  // Calculate Cell index that maps onto the GoL
  int x = ((grid_dimensions.x - 2) / 2) + id.x; 
  int y = (grid_dimensions.y / 2) - id.y; 
  return x + grid_dimensions.x * y;
}

// Returns the distance to closest block to point 'p' in the 
// grid of blocks.
vec2 gol_grid_distance(vec3 position) {
  // Add the block size to the point to center it
  position += BLOCK_SIZE;
  // Calculate spacing between block centers
  float spacing = 2.0 * BLOCK_SIZE + GRID_GUTTER_SIZE;
  // Round the position into discrete areas of space
  ivec2 id = ivec2(round(position.xy / spacing));
  // Determine if the area is above/below the axis line
  ivec2 o = sign(ivec2(position.xy - spacing) * id);
  float closest_distance = 1e20;
  // A 1D index of the block that maps onto the GoL simulation
  int index = 0;
  // We only need to check blocks in the x/y directions 
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
      // ID of block to check if it's closer
      ivec2 rid = id + ivec2(i, j) * o;
      // Limit repetition to within the grid dimensions
      rid = clamp(rid, -(grid_dimensions - 2) / 2, grid_dimensions / 2);
      // Block center
      vec3 block_location = position - spacing * vec3(rid, 0.0);

      // Cell Index
      int cell_index = calculateCellIndex(rid);

      // Adjust position of some blocks based on ID
      float a = 0.05 * sin(float(length(vec2(rid))) + time * 0.001);
      block_location.z += a;

      float block_distance = sdRoundBox(block_location); 
      if (block_distance < closest_distance) {
        closest_distance = block_distance;
        index = cell_index;
      }
    }
  return vec2(closest_distance, index);
}

// Distance from the ground plane
#define GROUND_PLANE_LOCATION 0.0
float ground_plane_distance(vec3 p) {
  float distance = abs(p.z - GROUND_PLANE_LOCATION);
  distance -= abs(sin((time + p.x + p.y)/1000.0)) * (0.125 * BLOCK_SIZE); 
  return distance;
}
`;

// Ray struct definition & generates rays for marching
const frag_ray_source = `
struct Ray {
  vec3 origin; 
  vec3 direction; 
};

// Generates a ray direction from fragment coordinates
Ray generatePerspectiveRay(vec2 resolution, vec2 fragCoord) {
  // Normalized Coordinates [-1,1]
  vec2 st = ((gl_FragCoord.xy * 2.0) - resolution.xy) / resolution.y;
  // Ray Direction (+z is "into the screen")
  vec3 rd = normalize(vec3(st, 1));
  return Ray(DEFAULT_RAY_ORIGIN, rd);
}

`;

export const fragment_shader_source =
  `#version 300 es 
precision highp float;

#define PI 3.1415926535
#define RGB /255.0 // e.g. 255.0 RGB -> (255.0 / 255.0) -> 1.0
#define VIEW_SCALE 8.0
#define DEFAULT_RAY_ORIGIN  vec3(0.0, 0.0, -VIEW_SCALE)

// Cells
uniform uint cells[64];
// The size of the screen in pixels
uniform vec2 resolution;
// Elapsed time in miliseconds 
uniform float time;
// Mouse Position (st)
uniform vec2 mouse;
// Grid Dimensions
uniform ivec2 grid_dimensions;

///////////
// SETUP //
///////////

// Blocks are N times the size of the space between them
#define GUTTER_RATIO 3.0
// Corners & Edges of blocks are rounded at 50%
#define ROUNDING_RATIO 0.5

// Spacing between blocks (will be updated)
float GRID_GUTTER_SIZE = 1.0;
// Half the side length of a cube (will be updated)
float BLOCK_SIZE = 0.5;
// How the corners and edges of the boxes are rounds (will be updated)
float BLOCK_ROUNDING = 0.1;
void set_grid_dimensions(float ratio) {
  // Get minimum dimension
  int min_dim = min(grid_dimensions.x, grid_dimensions.y);
  float min_dimension = float(min_dim);
  // If the screen is taller than wide, don't resize blocks to fit
  float nom = VIEW_SCALE * min(ratio, 1.0); 
  // Screen needs to fit N blocks and N+1 gutters
  float denom = (min_dimension + 1.0) + (GUTTER_RATIO * min_dimension);

  BLOCK_SIZE = (nom * GUTTER_RATIO) / denom;
  BLOCK_ROUNDING = BLOCK_SIZE * ROUNDING_RATIO;
  GRID_GUTTER_SIZE = nom / denom;
}

` +
  // Depends: BLOCK_SIZE & SETUP
  // Defines: SDF from scene objects
  frag_sdf_source +
  // Depends: --
  // Defines: Ray (struct), Perspective Ray Generation
  frag_ray_source +
  `
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

#define OBJ_GROUND 0
#define OBJ_BLOCK 1
// Closest object in the scene, from point 'p'
SceneObj nearestObject(vec3 position) {
  // vec2(distance, cell_id)
  vec2 grid = gol_grid_distance(position);
  int block_id = int(grid.y);
  float grid_distance = grid.x;
  return SceneObj(grid_distance, OBJ_BLOCK, block_id);
}

#define MAX_STEPS 300
// If our step is below this, we end the march
#define MARCH_ACCURACY 1e-5
// Beyond this distance we stop the march
#define MAX_MARCH_DISTANCE 1e+5
// Move a ray forward until it intersects with an object
SceneObj ray_march(in Ray ray) {
    float distance = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      // Find the closest object to the ray
      vec3 position = ray.origin + (distance * ray.direction);
	  SceneObj object = nearestObject(position);
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
    // If the ray doesn't hit anything
    return SceneObj(MAX_MARCH_DISTANCE,-1,-1);
}

// Cook-Torrance BRDF Material Model
struct PBRMat {
  vec3 color;
  float metallic;
  float roughness;
  float reflectance;
  float emissive;
  float ambient_occlusion;
};
PBRMat materials[3] = PBRMat[3](
    // Ground Plane
    PBRMat(
        vec3(0.8, 0.1, 0.5),
        0.0,
        0.9,
        0.1,
        0.0,
        0.3
    ),
    // Block (Inactive)
    PBRMat(
        vec3(23.0 RGB, 238.0 RGB, 232.0 RGB),
        // vec3(0.05),
        1.0,
        0.1,
        0.1,
        0.0,
        0.3
    ),
    // Block (Active)
    PBRMat(
        vec3(255.0 RGB, 105.0 RGB, 180.0 RGB),
        0.0,
        0.9,
        0.9,
        5.0,
        0.3
    )
);

// Get the distance from an object to a point
float getObjectSD(int type, int id, vec3 p) {
  float distance = 1e20;
  if (type == 0) { distance = ground_plane_distance(p); }
  // returns: vec2(distance, block_id)
  else if (type == 1) { distance = gol_grid_distance(p).x; }   
  return distance;
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

#define DIRECTIONAL_LIGHT 0
#define POSITIONAL_LIGHT 1
// A light source in the scene
struct Light 
{
    // 0 -> Directional Light
    // 1 -> Point Light
    int type; 
    // 'position' for a point light
    // 'direction' vector for directional light
    vec3 pos_dir_vec;
    vec3 color; 
    float intensity;
};
// White directional light, pointing away from camera
Light lights[1] = Light[1](Light(POSITIONAL_LIGHT, vec3(0.0, 0.0, -4.0), vec3(255.0 RGB, 255.0 RGB, 255.0 RGB), 32.0));

// Vector from position towards the light
Ray light_ray(vec3 position, Light light) {
    vec3 direction = vec3(0.0);
    if(light.type == 0) { // Directional Light
        direction = normalize(light.pos_dir_vec);
    } else if(light.type == 1) { // Positional Light
        direction = normalize(light.pos_dir_vec - position);
    }
    return Ray(position, direction);
}

// Distance from a point to a light
float light_dist(vec3 position, Light light) 
{ 
    // Directional Lights are 'infinitely' far away
    float distance = MAX_MARCH_DISTANCE;
    // Point Light
    if(light.type == 1) { distance = length(light.pos_dir_vec - position); }
    return distance;
}

// Shadowing, Masking for specular reflection
// You should calculate NoH & NoV and pass that into each function
float V_SmithGGXCorrelatedFast(float roughness, float LoN, float VoN) {
    
    float GGXV = LoN * (VoN * (1.0 - roughness) + roughness);
    float GGXL = VoN * (LoN * (1.0 - roughness) + roughness);
    return 0.5 / (GGXV + GGXL);
}

#define HIGHP_FLT_MAX    65504.0
#define saturateHighp(x) min(x, HIGHP_FLT_MAX)
float D_GGX(float roughness, float NoH, vec3 NxH) {
    float a = NoH * roughness;
    float k = roughness / (dot(NxH, NxH) + (a * a));
    float d = (k * k * (1.0 / PI));
    return saturateHighp(d);
}

vec3 F_Schlick(float VoH, vec3 f0, float f90) {
    return f0 + (vec3(f90) - f0) - pow(1.0 - VoH, 5.0);
}

// Intensity of a light source at a position
vec3 light_radiance(Light light, vec3 position) {
    float intensity_at_point = 1.0; // Default for directional lights
    if (light.type > 0) { // Doesn't apply to directional light
        float light_distance = light_dist(position, light);
        intensity_at_point = light.intensity / pow(light_distance, 2.0);
    }
    return light.color * intensity_at_point;
}

// Physically based rendering for a 'surface', hit by a 'ray' from a 'light'
vec3 PBR(Surface surface, Ray ray, Light light, out float reflectance) {
    ///////////////////
    // Specular Term //
    ///////////////////
    vec3 f0 = vec3(0.16 * pow(surface.mat.reflectance, 2.0)); // Achromatic dielectric approximation
    f0 = mix(f0, surface.mat.color, surface.mat.metallic); // Metals have chromatic reflections
    float f90 = 1.0; // Approximation

    vec3 surface_normal = normalize(surface.n); // Shouldn't this already be normalized?
    vec3 view_direction = normalize(ray.origin - surface.p);
    vec3 light_direction = normalize(light_ray(surface.p, light).direction);
    vec3 half_angle = normalize(view_direction + light_direction);
    vec3 HxN = cross(half_angle, surface_normal);
    vec3 light_radiance =  light_radiance(light, surface.p);

    // Precompute dot products
    float VoN = max(dot(view_direction, surface_normal), 0.0);
    float LoN = max(dot(light_direction, surface_normal), 0.0);
    float HoN = max(dot(half_angle, surface_normal), 0.0);
    float VoH = max(dot(view_direction, half_angle), 0.0);
    
    // Distribution of micro-facets
    float D = D_GGX(surface.mat.roughness, HoN, HxN);
    // Geometry/Visual term of facets (shadowing/masking)
    float V = V_SmithGGXCorrelatedFast(surface.mat.roughness, LoN, VoN);
    // Fresnel Reflectance
    vec3 F = F_Schlick(VoH, f0, f90);
    // Specular color
    vec3 Fs = D * V * F;

    //////////////////
    // Diffuse Term //
    //////////////////
    // Metal do not have a diffuse color (only specular)
    vec3 base_color = (1.0 - surface.mat.metallic) * surface.mat.color; 
    // Diffuse Color
    vec3 Fd = base_color * (1.0 / PI);
    
    // Ambient Term
    vec3 Fa = vec3(0.03) * surface.mat.color * (1.0 - surface.mat.ambient_occlusion);

    // Update reflectance term
    reflectance = length(F);
    return Fa + (Fs + Fd) * light_radiance * LoN;
}

vec3 emissive_radiance(Surface surface, vec3 position) {
    float distance = distance(surface.p, position); 
    float intensity_at_point = surface.mat.emissive / min(1.0, pow(distance, 2.0));
    return surface.mat.color * intensity_at_point;
}

#define SHADOW_FACTOR vec3(0.03)
// Calculate a color reflected from the POV of 'ray' upon the 'surface'
vec3 direct_illumination(in Surface surface, in Ray ray, out float reflectance) {
    vec3 color = vec3(0.0);
    // For every light
    for(int i = 0 ; i < lights.length(); i++) {
      // Create a ray pointing from the surface to the light source
      Ray l_ray = light_ray(surface.p, lights[i]);
      // Offset the origin a small amount for float rounding errors / self collision
      l_ray.origin = surface.p + 0.01 * surface.n;

      // Find the object (if any) the ray intersects with
	  SceneObj object = ray_march(l_ray);
	  float distance_to_light = light_dist(surface.p, lights[i]);

      // If the ray collides with another object, closer to the light source
	  if (object.type >= 0 && (object.dist < distance_to_light)) {
        // It's in shadow
	    color +=  SHADOW_FACTOR * surface.mat.color * surface.mat.ambient_occlusion;
      } else { // Color/Light normally
        float r;
	    color += PBR(surface, ray, lights[i], r);
        reflectance += r;
	  }
    }
    // Add emissive light from the object itself
    // color += emissive_radiance(surface, ray.origin);
    return color;
}

#define GROUND_PLANE_MATERIAL 0
#define BLOCK_MATERIAL 1
#define BLOCK_ACTIVE_MATERIAL 2
uint getbits(uint value, uint offset, uint n) {
  uint max_n = 32u;
  if (offset >= max_n)
    return 0u; /* value is padded with infinite zeros on the left */
  value >>= offset; /* drop offset bits */
  if (n >= max_n)
    return value; /* all  bits requested */
  uint mask = (1u << n) - 1u; /* n '1's */
  return value & mask;
}
PBRMat getObjectMaterial(int type, int id) {
    // Default to ground plane
    PBRMat material = materials[GROUND_PLANE_MATERIAL];
    // Block
    if (type == 1) {
        uint u8_id = uint(id) / 4u;
        uint offset = uint(id) % 4u;
        offset = offset * 7u + offset;
      if (getbits(cells[u8_id], offset, 8u) == 1u) {
        material = materials[BLOCK_ACTIVE_MATERIAL]; 
      } else { material = materials[BLOCK_MATERIAL]; }
    }
    return material;
}

#define GAMMA 2.1
#define RAY_OFFSET 0.05
#define NUM_REFLECTIONS 3
#define REFLECTION_COEFFICIENT 0.3
vec3 march(in Ray input_ray) {
  // Shadow the input ray
  Ray ray = input_ray;
  // Accumulating the final color
  vec3 final_color = vec3(0.0);
  // Reduces contributions to the final color 
  vec3 mask = vec3(1.0);

  for(int i = 0; i < NUM_REFLECTIONS; i++) {
    // Find the first object the ray intersects
    SceneObj object = ray_march(ray);
    // If the ray hit an object (-1 indicates no intersections)
    if (object.type >= 0) {
      // Generate a 'surface' where the ray hit the object 
      vec3 position = ray.origin + object.dist * ray.direction;
      PBRMat material = getObjectMaterial(object.type, object.id);
      vec3 normal = normalize(computeSDFGrad(object, position));
      Surface surface = Surface(position, normal, material);
      
      // How much the last surface hit reflects light
      float reflection_coefficient = 0.3;
      // Calculate the color of the surface
      vec3 color = vec3(0.0);
      if (surface.mat.emissive > 0.0) {
        vec3 view_direction = normalize(ray.origin - surface.p);
        float LoN = max(dot(view_direction, surface.n), 0.0);
        color = surface.mat.emissive * surface.mat.color * LoN;
        //color = emissive_radiance(surface, ray.origin) * LoN;
      } else { // Shade normally
        color = direct_illumination(surface, ray, reflection_coefficient);
      }
        
      // Update the final color of the fragment
      final_color += (mask * color);
      mask *= reflection_coefficient;
        
      if (surface.mat.emissive > 0.0) { break; }
      
      // Create a new reflection ray for the next loop iteration
      // Move the ray a little off the surface to avoid float rounding errors
      vec3 new_position = surface.p + RAY_OFFSET * surface.n;
      ray = Ray(new_position, reflect(ray.direction, surface.n));
    } 
  }
    
  // Color Corrections
  // HDR Correction
  final_color /= (final_color + vec3(1.0));
  //Gamma Correction
  final_color = pow(final_color, vec3(1.0 / GAMMA));

  return final_color; 
}

float sdSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2-d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h); 
}

// Returns the distance to our cloud
// float cloud_distance(vec3 position) {
//       
// }

// [0,1] normalized fragment coordinates
in vec2 texcoords;
out vec4 fragColor;

void main() {
  // Set the grid dimensions (number of blocks for the GOL)
  // Such that they fill the user's screen.
  float res_ratio = resolution.x / resolution.y;
  set_grid_dimensions(res_ratio);

  // Update the position of the spot light
  lights[0].pos_dir_vec.x = mouse.x * 8.0 * max(1.0, res_ratio);
  lights[0].pos_dir_vec.y = mouse.y * 8.0 * max(1.0, 1.0 / res_ratio);
  
  // Ray Marching
  Ray ray = generatePerspectiveRay(resolution.xy, gl_FragCoord.xy);
  // Output Color
  vec3 color = march(ray);
  fragColor = vec4(color, 1);
}

`;

export const vertex_shader_source = `#version 300 es
        in vec4 position;
        out vec2 texcoords; // [0,1] st coordinates 

        void main() {
            vec2 vertices[3]=vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1, 3));
            gl_Position = vec4(vertices[gl_VertexID],0,1);
            texcoords = 0.5 * gl_Position.xy + vec2(0.5);
        }
`;
