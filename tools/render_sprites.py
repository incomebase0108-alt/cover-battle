"""
Render top-down sprite art for Cover Battle with Blender (headless).

Run:  blender --background --python tools/render_sprites.py

Produces, in assets/:
  soldier_blue.png / soldier_red.png  (face +X, so the game rotates them by aim)
  fort_blue.png    / fort_red.png     (drawn unrotated at the base centre)

Uses Cycles (CPU) with a transparent film so the PNGs have alpha, plus a
shadow-catcher ground plane so each piece gets a soft grounding shadow. Models
are stylised/low-poly but lit for a little-3D-toy look rather than flat shapes.
"""
import bpy
import math
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
os.makedirs(OUT, exist_ok=True)

BLUE = (0.10, 0.36, 1.0)
RED = (1.0, 0.18, 0.18)
DARK_BLUE = (0.04, 0.13, 0.38)
DARK_RED = (0.36, 0.06, 0.06)
METAL = (0.06, 0.07, 0.09)
STONE = (0.50, 0.48, 0.44)
STONE_D = (0.30, 0.28, 0.25)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def mat(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def cube(loc, scale, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.rotation_euler = rot
    bev = o.modifiers.new("bev", "BEVEL")
    bev.width = 0.04
    bev.segments = 2
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def sphere(loc, r, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=28, ring_count=14)
    o = bpy.context.active_object
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def cyl(loc, r, depth, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=24)
    o = bpy.context.active_object
    o.rotation_euler = rot
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def setup_scene(ortho, cam_z=10.0):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 200
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    bpy.ops.object.camera_add(location=(0, 0, cam_z), rotation=(0, 0, 0))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho
    scene.camera = cam

    bpy.ops.object.light_add(type="SUN", location=(5, -5, 10))
    sun = bpy.context.active_object
    sun.data.energy = 5.5
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(38), math.radians(12), math.radians(28))
    bpy.ops.object.light_add(type="AREA", location=(-5, 5, 8))
    fill = bpy.context.active_object
    fill.data.energy = 320
    fill.data.size = 10
    bg = bpy.data.worlds["World"].node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.67, 0.72, 1)
    bg.inputs[1].default_value = 0.3

    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
    bpy.context.active_object.is_shadow_catcher = True


def render(path, res):
    scene = bpy.context.scene
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)


def build_soldier(color, dark):
    uni = mat("uni", color, rough=0.5)
    drk = mat("drk", dark, rough=0.55)
    met = mat("met", METAL, rough=0.35, metal=0.85)
    helmet = mat("helmet", tuple(c * 0.7 for c in color), rough=0.45)

    cube((0.42, 0.22, 0.12), (0.5, 0.22, 0.22), drk)
    cube((0.42, -0.22, 0.12), (0.5, 0.22, 0.22), drk)
    cube((-0.58, 0, 0.4), (0.45, 0.6, 0.55), drk)
    cyl((0, 0, 0.42), 0.62, 0.62, uni)
    cyl((0.05, 0.55, 0.5), 0.2, 0.32, uni, rot=(math.radians(90), 0, 0))
    cyl((0.05, -0.55, 0.5), 0.2, 0.32, uni, rot=(math.radians(90), 0, 0))
    cube((0.5, 0.34, 0.55), (0.7, 0.16, 0.18), uni, rot=(0, 0, math.radians(-18)))
    cube((0.5, -0.34, 0.55), (0.7, 0.16, 0.18), uni, rot=(0, 0, math.radians(18)))
    cube((-0.05, 0.0, 0.6), (0.4, 0.16, 0.2), drk)
    cube((0.35, 0.0, 0.62), (0.6, 0.17, 0.2), met)
    cube((1.05, 0.0, 0.62), (1.0, 0.1, 0.12), met)
    cube((0.55, 0.12, 0.74), (0.34, 0.06, 0.06), met)
    sphere((0.0, 0.0, 0.78), 0.4, helmet)
    cube((0.32, 0.0, 0.72), (0.22, 0.5, 0.1), drk)


def build_fort(color, dark):
    wall = mat("wall", STONE, rough=0.85)
    wall_d = mat("wall_d", STONE_D, rough=0.9)
    roof = mat("roof", color, rough=0.5)
    trim = mat("trim", tuple(c * 0.7 for c in color), rough=0.55)
    flagm = mat("flag", color, rough=0.4)
    pole = mat("pole", (0.18, 0.18, 0.2), rough=0.4, metal=0.7)

    cube((0, 0, 0.12), (2.4, 2.4, 0.24), wall_d)
    cube((0, 1.05, 0.55), (2.4, 0.34, 0.85), wall)
    cube((0, -1.05, 0.55), (2.4, 0.34, 0.85), wall)
    cube((1.05, 0, 0.55), (0.34, 2.4, 0.85), wall)
    cube((-1.05, 0, 0.55), (0.34, 2.4, 0.85), wall)
    for t in (-0.85, -0.3, 0.3, 0.85):
        cube((t, 1.05, 1.02), (0.22, 0.4, 0.2), trim)
        cube((t, -1.05, 1.02), (0.22, 0.4, 0.2), trim)
        cube((1.05, t, 1.02), (0.4, 0.22, 0.2), trim)
        cube((-1.05, t, 1.02), (0.4, 0.22, 0.2), trim)
    for cx in (-1.05, 1.05):
        for cy in (-1.05, 1.05):
            cube((cx, cy, 0.62), (0.62, 0.62, 1.0), wall)
            cube((cx, cy, 1.16), (0.66, 0.66, 0.14), roof)
    cube((0, 0, 0.7), (1.0, 1.0, 1.3), wall)
    bpy.ops.mesh.primitive_cone_add(radius1=0.8, radius2=0, depth=0.6, location=(0, 0, 1.6), vertices=4, rotation=(0, 0, math.radians(45)))
    cone = bpy.context.active_object
    cone.data.materials.append(roof)
    bpy.ops.object.shade_smooth()
    cyl((0, 0, 2.1), 0.04, 0.7, pole)
    cube((0.26, 0.0, 2.3), (0.46, 0.02, 0.3), flagm)


def main():
    for name, col, drk in (("blue", BLUE, DARK_BLUE), ("red", RED, DARK_RED)):
        clear()
        setup_scene(ortho=3.2)
        build_soldier(col, drk)
        render(os.path.join(OUT, f"soldier_{name}.png"), 192)
    for name, col, drk in (("blue", BLUE, DARK_BLUE), ("red", RED, DARK_RED)):
        clear()
        setup_scene(ortho=6.2, cam_z=12.0)
        build_fort(col, drk)
        render(os.path.join(OUT, f"fort_{name}.png"), 256)


main()
