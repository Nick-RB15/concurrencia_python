"""
Genera modelos .glb de marcador de posicion para Astro Scout.
Reemplaza estos archivos por tus modelos reales exportados de Blender,
manteniendo los mismos nombres en /models.

Uso:  python3 tools/make_placeholder_models.py
Requiere: pip install trimesh numpy
"""
import os
import numpy as np
import trimesh

OUT = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(OUT, exist_ok=True)


def colored(mesh, rgba):
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, face_colors=np.array(rgba))
    return mesh


def save(scene_or_mesh, name):
    path = os.path.join(OUT, name)
    scene_or_mesh.export(path)
    print("wrote", os.path.relpath(path))


# 01 - Casco: esfera con visor
def casco():
    head = colored(trimesh.creation.icosphere(subdivisions=3, radius=1.0),
                   [230, 236, 245, 255])
    visor = colored(trimesh.creation.icosphere(subdivisions=3, radius=0.72),
                    [77, 166, 255, 200])
    visor.apply_translation([0, 0.05, 0.45])
    return trimesh.Scene([head, visor])


# 02 - Brujula: cilindro plano + aguja
def brujula():
    body = colored(trimesh.creation.cylinder(radius=1.0, height=0.28, sections=48),
                   [21, 29, 51, 255])
    ring = colored(trimesh.creation.annulus(r_min=0.9, r_max=1.0, height=0.34, sections=48),
                   [77, 166, 255, 255])
    needle = colored(trimesh.creation.box(extents=[0.12, 1.4, 0.08]),
                     [255, 179, 71, 255])
    needle.apply_translation([0, 0, 0.2])
    return trimesh.Scene([body, ring, needle])


# 03 - Botiquin: caja con cruz
def botiquin():
    box = colored(trimesh.creation.box(extents=[1.6, 1.1, 0.7]),
                  [230, 236, 245, 255])
    v = colored(trimesh.creation.box(extents=[0.25, 0.8, 0.1]), [220, 60, 70, 255])
    h = colored(trimesh.creation.box(extents=[0.8, 0.25, 0.1]), [220, 60, 70, 255])
    v.apply_translation([0, 0, 0.36]); h.apply_translation([0, 0, 0.36])
    return trimesh.Scene([box, v, h])


# 04 - Panel de oxigeno: panel con "botones"
def panel():
    board = colored(trimesh.creation.box(extents=[1.8, 1.2, 0.15]),
                    [21, 29, 51, 255])
    parts = [board]
    for i, x in enumerate([-0.55, 0.0, 0.55]):
        c = [61, 220, 151, 255] if i != 1 else [255, 179, 71, 255]
        led = colored(trimesh.creation.cylinder(radius=0.18, height=0.22, sections=32), c)
        led.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        led.apply_translation([x, 0.2, 0.12])
        parts.append(led)
    return trimesh.Scene(parts)


# 05 - Guante: caja alargada (palma) + dedos
def guante():
    palm = colored(trimesh.creation.box(extents=[0.9, 1.0, 0.35]),
                   [77, 166, 255, 255])
    parts = [palm]
    for x in np.linspace(-0.32, 0.32, 4):
        f = colored(trimesh.creation.capsule(height=0.6, radius=0.11), [230, 236, 245, 255])
        f.apply_translation([x, 0.75, 0])
        parts.append(f)
    thumb = colored(trimesh.creation.capsule(height=0.45, radius=0.12), [230, 236, 245, 255])
    thumb.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 3, [0, 0, 1]))
    thumb.apply_translation([-0.55, 0.15, 0])
    parts.append(thumb)
    return trimesh.Scene(parts)


if __name__ == "__main__":
    save(casco(), "casco.glb")
    save(brujula(), "brujula.glb")
    save(botiquin(), "botiquin.glb")
    save(panel(), "panel_oxigeno.glb")
    save(guante(), "guante.glb")
    print("Listo. Reemplaza estos .glb por tus modelos reales de Blender.")
