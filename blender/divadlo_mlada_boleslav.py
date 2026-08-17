#!/usr/bin/env python3
"""
Městské divadlo Mladá Boleslav — parametrický model budovy pro Blender.

Předloha: secesní budova v Palackého ulici, postavená 1906–1909 podle návrhu
architektů Jana Kříženeckého a Emila Králíka (interiér Fellner & Helmer).

Modelované architektonické znaky podle popisu památky:
  * jednoduchá obdélná dispozice rozšířená o vstupní rizalit, rizality schodišť
    v postranních fasádách a přístavbu při zadní části budovy,
  * sedlová střecha nad hlavní hmotou, mansardová nad vyvýšeným provazištěm,
  * dvoupatrová nástavba s okny a sloupy nad prostorem jeviště,
  * výrazná konzolová římsa a balustrádová atika s nárožními maskami,
  * dva boční pylony se sochami po stranách vstupního rizalitu
    (Probuzení národa / Vítězství umění, Jan Štursa),
  * keramické maskarony, měděné věnce a festony, monogram, figura Thálie
    a nápisové pole s heslem „Umění — síla života“.

Model je stylizovaný: vychází z popisu a proporcí památky, ne z geodetického
zaměření. Rozměry v metrech, osa Z nahoru, hlavní průčelí míří k -Y.

Spuštění:
    blender --background --python divadlo_mlada_boleslav.py
    python3 divadlo_mlada_boleslav.py          # s pip modulem `bpy`

Přepínače (za `--` při spuštění přes blender):
    --no-render     jen postaví a vyexportuje model, nerenderuje
    --quick         rychlé náhledy v nízkém rozlišení
    --samples N     počet vzorků Cycles (výchozí 96)
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# --------------------------------------------------------------------------
# parametry budovy
# --------------------------------------------------------------------------

# hlavní hmota (foyer + hlediště)
MAIN_X = 12.0                 # polovina šířky
MAIN_Y0, MAIN_Y1 = 0.0, 26.0
PLINTH_TOP = 1.4              # horní hrana kamenného soklu
MAIN_CORNICE = 12.2           # spodní hrana konzolové římsy
MAIN_CORNICE_TOP = 13.3
MAIN_ATTIC_TOP = 14.8         # horní hrana balustrádové atiky
MAIN_RIDGE = 17.6             # hřeben sedlové střechy

# vstupní rizalit
RIS_X = 6.6
RIS_Y0, RIS_Y1 = -3.4, 0.0
RIS_DOOR_Z, RIS_DOOR_H = PLINTH_TOP, 3.5
BALCONY_Z = 5.85              # horní líc balkonové desky
BALCONY_RAIL_H = 1.0
RIS_WIN_Z, RIS_WIN_H = 7.05, 3.65
RIS_CORNICE = 11.0
RIS_CORNICE_TOP = 12.0
RIS_ATTIC_TOP = 13.4

# pylony se sochami — vnitřním lícem přisedají k boku rizalitu (RIS_X),
# aby mezi nimi nevznikala hluboká stínová spára
PYL_HALF = 1.05
PYL_X = 6.6 + PYL_HALF
PYL_Y0, PYL_Y1 = -3.7, -1.3
PYL_TOP = 14.6

# jevištní část s provazištěm
STAGE_X = 10.0
STAGE_Y0, STAGE_Y1 = 24.0, 37.0
STAGE_CORNICE = 20.4
STAGE_ATTIC_TOP = 24.0
STAGE_MANSARD_MID = 26.2
STAGE_RIDGE = 27.6

# zadní přístavba
ANNEX_X = 7.6
ANNEX_Y0, ANNEX_Y1 = 37.0, 43.0
ANNEX_TOP = 9.2

# boční rizality schodišť
STAIR_Y0, STAIR_Y1 = 8.6, 14.6
STAIR_OUT = 1.7
STAIR_TOP = 12.6

WALL_T = 0.65                 # tloušťka obvodového zdiva
GLASS_INSET = 0.26            # zapuštění zasklení do špalety
ARCH_SEG = 22                 # dělení půlkruhového záklenku

# osy okenních os
WING_BAYS = [-10.0, -7.8, 7.8, 10.0]
RIS_BAYS = [-4.8, -2.4, 0.0, 2.4, 4.8]
SIDE_BAYS = [2.2, 4.6, 7.0, 16.4, 18.8, 21.2, 23.6]

MATERIALS = {}
COLLECTIONS = {}


# --------------------------------------------------------------------------
# infrastruktura
# --------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects,
                  bpy.data.curves, bpy.data.collections, bpy.data.lights,
                  bpy.data.cameras, bpy.data.worlds):
        for item in list(block):
            block.remove(item)
    MATERIALS.clear()
    COLLECTIONS.clear()


def collection(name):
    if name not in COLLECTIONS:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        COLLECTIONS[name] = col
    return COLLECTIONS[name]


def material(name, color, roughness=0.6, metallic=0.0, transmission=0.0,
             ior=1.45):
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    MATERIALS[name] = mat
    return mat


def _place(obj, mat, col_name):
    if obj.data is not None and hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection(col_name).objects.link(obj)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, mat, col="Hmota"):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    obj.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    return _place(obj, mat, col)


def prism(name, profile, axis, a, b, mat, col="Střechy"):
    """Hranol: uzavřený 2D profil [(u, z), …] protažený podél osy X nebo Y."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo, hi = [], []
    for u, z in profile:
        if axis == 'X':
            lo.append(bm.verts.new((a, u, z)))
            hi.append(bm.verts.new((b, u, z)))
        else:
            lo.append(bm.verts.new((u, a, z)))
            hi.append(bm.verts.new((u, b, z)))
    bm.faces.new(lo)
    bm.faces.new(list(reversed(hi)))
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return _place(obj, mat, col)


def cylinder(name, radius, depth, location, rotation=(0, 0, 0), verts=16,
             mat=None, col="Výzdoba", scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius,
                                        depth=depth, location=location,
                                        rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return _place(obj, mat, col)


def cone(name, r1, r2, depth, location, verts=16, mat=None, col="Sochy",
         scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return _place(obj, mat, col)


def sphere(name, radius, location, mat, col="Výzdoba", scale=(1, 1, 1),
           segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return _place(obj, mat, col)


def join(objs, name, col="Výzdoba"):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


# --------------------------------------------------------------------------
# fasáda s otvory
# --------------------------------------------------------------------------

def _arc(uc, r, spring, segs, reverse=False):
    """Body půlkruhového záklenku (od pravé paty přes vrchol k levé)."""
    pts = []
    for i in range(segs + 1):
        a = math.pi * i / segs
        pts.append((uc + r * math.cos(a), spring + r * math.sin(a)))
    return list(reversed(pts)) if reverse else pts


class Facade:
    """Stěna v rovině XZ (normála ±Y) nebo YZ (normála ±X) s okenními otvory.

    Zdivo se neřeže booleany — skládá se z parapetních pásů, meziokenních
    pilířů a záklenkových nadpraží, takže otvory jsou skutečné a síť čistá.
    """

    def __init__(self, name, axis, face, inward, u0, u1, z0, z1, thickness,
                 mat, col="Průčelí"):
        self.name = name
        self.axis = axis          # 'Y' → stěna v XZ; 'X' → stěna v YZ
        self.face = face          # souřadnice vnějšího líce
        self.inward = inward      # +1 / -1, směr do budovy
        self.u0, self.u1 = u0, u1
        self.z0, self.z1 = z0, z1
        self.t = thickness
        self.mat = mat
        self.col = col
        self.rows = []
        self.parts = []

    def add_row(self, z, h, centers, width, arched=False):
        self.rows.append((z, h, [(u, width, arched) for u in sorted(centers)]))
        return self

    # -- primitivní díly ---------------------------------------------------
    def _seg(self, ua, ub, za, zb, tag, depth=None, offset=0.0, mat=None):
        depth = self.t if depth is None else depth
        n0 = self.face + self.inward * offset
        n1 = n0 + self.inward * depth
        mat = mat or self.mat
        if self.axis == 'Y':
            o = box(tag, ua, ub, min(n0, n1), max(n0, n1), za, zb, mat, self.col)
        else:
            o = box(tag, min(n0, n1), max(n0, n1), ua, ub, za, zb, mat, self.col)
        self.parts.append(o)
        return o

    def _prism(self, profile, tag, depth=None, offset=0.0, mat=None):
        depth = self.t if depth is None else depth
        n0 = self.face + self.inward * offset
        n1 = n0 + self.inward * depth
        mat = mat or self.mat
        o = prism(tag, profile, 'Y' if self.axis == 'Y' else 'X',
                  min(n0, n1), max(n0, n1), mat, self.col)
        self.parts.append(o)
        return o

    # -- stavba ------------------------------------------------------------
    def build(self):
        rows = sorted(self.rows, key=lambda r: r[0])
        z = self.z0
        for idx, (rz, rh, ops) in enumerate(rows):
            if rz > z + 1e-6:
                self._seg(self.u0, self.u1, z, rz, f"{self.name}_pas{idx}")
            u = self.u0
            for k, (uc, w, _) in enumerate(ops):
                a, b = uc - w / 2, uc + w / 2
                if a > u + 1e-6:
                    self._seg(u, a, rz, rz + rh, f"{self.name}_pilir{idx}_{k}")
                u = b
            if u < self.u1 - 1e-6:
                self._seg(u, self.u1, rz, rz + rh, f"{self.name}_pilir{idx}_e")
            z = max(z, rz + rh)
        if z < self.z1 - 1e-6:
            self._seg(self.u0, self.u1, z, self.z1, f"{self.name}_pas_horni")

        # zdivo nad půlkruhovým záklenkem (parapetní pole mezi obloukem a nadpražím)
        for idx, (rz, rh, ops) in enumerate(rows):
            for k, (uc, w, arched) in enumerate(ops):
                if not arched:
                    continue
                r, top = w / 2, rz + rh
                profile = ([(uc + r, top), (uc - r, top)]
                           + _arc(uc, r, top - r, ARCH_SEG, reverse=True))
                self._prism(profile, f"{self.name}_zaklenek{idx}_{k}")
        return self

    def glazing(self, mat_glass, mat_frame, mullions=1):
        """Zapuštěné zasklení, svislé pruty a vystupující parapetní deska."""
        for idx, (rz, rh, ops) in enumerate(sorted(self.rows, key=lambda r: r[0])):
            for k, (uc, w, arched) in enumerate(ops):
                r, top = w / 2, rz + rh
                gtop = top - r if arched else top
                self._seg(uc - r, uc + r, rz, gtop, f"{self.name}_sklo{idx}_{k}",
                          depth=0.09, offset=GLASS_INSET, mat=mat_glass)
                if arched:
                    # lunetová výplň pod záklenkem
                    self._prism(_arc(uc, r, gtop, ARCH_SEG),
                                f"{self.name}_luneta{idx}_{k}",
                                depth=0.09, offset=GLASS_INSET, mat=mat_glass)
                for m in range(mullions):
                    mu = uc - r + w * (m + 1) / (mullions + 1)
                    self._seg(mu - 0.045, mu + 0.045, rz, top - 0.05,
                              f"{self.name}_prut{idx}_{k}_{m}",
                              depth=0.10, offset=GLASS_INSET - 0.06,
                              mat=mat_frame)
                # ostění a parapet
                self._seg(uc - r - 0.20, uc + r + 0.20, rz - 0.18, rz,
                          f"{self.name}_parapet{idx}_{k}",
                          depth=0.30, offset=-0.15)
        return self


# --------------------------------------------------------------------------
# architektonické prvky
# --------------------------------------------------------------------------

def cornice(name, x0, x1, y0, y1, z, height, overhang, mat, consoles=None,
            col="Průčelí"):
    """Vyložená římsa, volitelně nesená řadou konzol."""
    out = [box(f"{name}_deska", x0 - overhang, x1 + overhang,
               y0 - overhang, y1 + overhang, z, z + height, mat, col)]
    if consoles:
        step, sides = consoles
        cz0, cz1 = z - 0.7, z
        for edge in sides:
            if edge in ('front', 'back'):
                y = (y0 - overhang * 0.55) if edge == 'front' else (y1 + overhang * 0.55)
                n = max(int((x1 - x0) / step), 1)
                for i in range(n + 1):
                    x = x0 + (x1 - x0) * i / n
                    out.append(box(f"{name}_kz_{edge}{i}", x - 0.15, x + 0.15,
                                   y - 0.26, y + 0.26, cz0, cz1, mat, col))
            else:
                x = (x0 - overhang * 0.55) if edge == 'left' else (x1 + overhang * 0.55)
                n = max(int((y1 - y0) / step), 1)
                for i in range(n + 1):
                    y = y0 + (y1 - y0) * i / n
                    out.append(box(f"{name}_kz_{edge}{i}", x - 0.26, x + 0.26,
                                   y - 0.15, y + 0.15, cz0, cz1, mat, col))
    return out


def balustrade(name, a, b, z, height, mat, col="Výzdoba", spacing=0.72):
    """Balustráda podél vodorovné úsečky a→b (v půdorysu)."""
    (ax, ay), (bx, by) = a, b
    length = math.hypot(bx - ax, by - ay)
    n = max(int(length / spacing), 1)
    hw = 0.19
    dx, dy = (bx - ax) / length, (by - ay) / length
    px, py = abs(-dy * hw), abs(dx * hw)
    out = []
    for i, (zz, hh) in enumerate(((z, 0.15), (z + height - 0.20, 0.20))):
        out.append(box(f"{name}_deska{i}", min(ax, bx) - px, max(ax, bx) + px,
                       min(ay, by) - py, max(ay, by) + py, zz, zz + hh, mat, col))
    for i in range(n):
        f = (i + 0.5) / n
        cx, cy = ax + (bx - ax) * f, ay + (by - ay) * f
        out.append(cone(f"{name}_bal{i}", 0.135, 0.085, height - 0.35,
                        (cx, cy, z + height / 2 - 0.02), verts=8, mat=mat,
                        col=col))
        out.append(sphere(f"{name}_bricho{i}", 0.145,
                          (cx, cy, z + height * 0.33), mat, col,
                          scale=(1, 1, 0.8), segments=8, rings=5))
    return out


def pilaster(name, x, y_out, depth, z0, z1, mat, mat_cap, width=0.52,
             col="Průčelí"):
    """Lizéna s patkou a zlacenou hlavicí, vystupující z líce o `depth`."""
    y0, y1 = y_out - depth, y_out
    return [box(f"{name}_drik", x - width / 2, x + width / 2, y0, y1,
                z0 + 0.32, z1 - 0.48, mat, col),
            box(f"{name}_patka", x - width * 0.72, x + width * 0.72,
                y0 - 0.04, y1, z0, z0 + 0.32, mat, col),
            box(f"{name}_hlavice", x - width * 0.8, x + width * 0.8,
                y0 - 0.06, y1, z1 - 0.48, z1, mat_cap, col)]


def mascaron(name, x, y, z, mat_ceramic, mat_gold, r=0.38, col="Výzdoba"):
    """Keramický maskaron v měděném věnci — druh dramatického umění."""
    return [cylinder(f"{name}_venec", r, 0.13, (x, y - 0.02, z),
                     rotation=(math.pi / 2, 0, 0), verts=20, mat=mat_gold,
                     col=col),
            cylinder(f"{name}_terc", r * 0.7, 0.16, (x, y - 0.05, z),
                     rotation=(math.pi / 2, 0, 0), verts=18, mat=mat_ceramic,
                     col=col),
            sphere(f"{name}_maska", r * 0.46, (x, y - 0.09, z), mat_ceramic,
                   col, scale=(0.8, 0.42, 1.05), segments=12, rings=8)]


def festoon(name, x0, x1, y, z, mat, col="Výzdoba", sag=0.40, steps=11):
    """Zavěšený měděný feston."""
    out = []
    for i in range(steps):
        f = (i + 0.5) / steps
        cx = x0 + (x1 - x0) * f
        cz = z - sag * math.sin(math.pi * f)
        rad = 0.065 + 0.045 * math.sin(math.pi * f)
        out.append(sphere(f"{name}_{i}", rad, (cx, y, cz), mat, col,
                          scale=(1.5, 0.9, 1.0), segments=8, rings=6))
    return out


def statue(name, x, y, z, mat, height=3.4, arm_up=True, col="Sochy"):
    """Stylizovaná bronzová figura (Štursovy sochy na pylonech, Thálie).

    Silueta se v pase zužuje a v ramenou zase rozšiřuje — jinak by figura
    z odstupu četla jako pouhý kužel.
    """
    s = height / 3.4
    out = [
        box(f"{name}_sokl", x - 0.5 * s, x + 0.5 * s, y - 0.5 * s, y + 0.5 * s,
            z, z + 0.3 * s, mat, col),
        # splývavé roucho: od paty k pasu se zužuje
        cone(f"{name}_rouch", 0.54 * s, 0.26 * s, 1.7 * s,
             (x, y, z + 1.15 * s), verts=14, mat=mat, col=col,
             scale=(1.0, 0.74, 1.0)),
        # hrudník: od pasu se opět rozšiřuje k ramenům
        cone(f"{name}_hrudnik", 0.26 * s, 0.40 * s, 0.95 * s,
             (x, y, z + 2.45 * s), verts=14, mat=mat, col=col,
             scale=(1.0, 0.60, 1.0)),
        box(f"{name}_ramena", x - 0.46 * s, x + 0.46 * s, y - 0.19 * s,
            y + 0.19 * s, z + 2.84 * s, z + 3.02 * s, mat, col),
        cylinder(f"{name}_krk", 0.11 * s, 0.22 * s, (x, y, z + 3.10 * s),
                 verts=10, mat=mat, col=col),
        sphere(f"{name}_hlava", 0.22 * s, (x, y, z + 3.38 * s), mat, col,
               scale=(1.0, 1.15, 1.25), segments=14, rings=9),
    ]
    if arm_up:
        # vztyčená paže s vavřínem
        # paže vzhůru a ven; vavřín sedí na špičce kužele, ne vedle ní —
        # špička = střed + Ry(tilt)·(0, 0, depth/2)
        tilt, depth = math.radians(24), 1.5 * s
        cx, cz = x + 0.44 * s, z + 3.16 * s
        arm = cone(f"{name}_paze_vzhuru", 0.11 * s, 0.075 * s, depth,
                   (cx, y - 0.05 * s, cz), verts=8, mat=mat, col=col)
        arm.rotation_euler = (0.0, tilt, 0.0)
        out.append(arm)
        out.append(sphere(f"{name}_vavrin", 0.19 * s,
                          (cx + math.sin(tilt) * depth / 2, y - 0.05 * s,
                           cz + math.cos(tilt) * depth / 2), mat, col,
                          scale=(1.0, 0.5, 1.0), segments=12, rings=7))
    else:
        arm = cone(f"{name}_paze_vpred", 0.11 * s, 0.075 * s, 1.35 * s,
                   (x + 0.44 * s, y - 0.34 * s, z + 2.62 * s), verts=8,
                   mat=mat, col=col)
        arm.rotation_euler = (math.radians(-62), 0.0, 0.0)
        out.append(arm)
    arm2 = cone(f"{name}_paze_dolu", 0.11 * s, 0.075 * s, 1.35 * s,
                (x - 0.48 * s, y - 0.06 * s, z + 2.42 * s), verts=8,
                mat=mat, col=col)
    arm2.rotation_euler = (0.0, math.radians(9), 0.0)
    out.append(arm2)
    return out


# --------------------------------------------------------------------------
# stavba budovy
# --------------------------------------------------------------------------

def build_theatre():
    m_plaster = material("Omítka_hlavni", (0.585, 0.492, 0.338), roughness=0.80)
    m_light = material("Omítka_svetla", (0.790, 0.735, 0.615), roughness=0.72)
    m_stone = material("Kámen_sokl", (0.360, 0.348, 0.325), roughness=0.86)
    m_copper = material("Měď_patina", (0.180, 0.412, 0.352), roughness=0.52,
                        metallic=0.4)
    m_gold = material("Zlacení", (0.735, 0.560, 0.205), roughness=0.30,
                      metallic=0.92)
    m_glass = material("Sklo", (0.045, 0.062, 0.078), roughness=0.07,
                       transmission=0.82, ior=1.5)
    m_wood = material("Dveře_dub", (0.098, 0.052, 0.030), roughness=0.45)
    m_bronze = material("Bronz_socha", (0.135, 0.118, 0.092), roughness=0.40,
                        metallic=0.85)
    m_ceramic = material("Keramika_maskaron", (0.520, 0.215, 0.140),
                         roughness=0.30)
    m_ground = material("Dlažba", (0.235, 0.228, 0.218), roughness=0.92)

    deco, roofs = [], []

    # ---- sokly ----------------------------------------------------------
    box("Sokl_hlavni", -MAIN_X - 0.3, MAIN_X + 0.3, MAIN_Y0 - 0.3,
        MAIN_Y1 + 0.3, 0.0, PLINTH_TOP, m_stone)
    box("Sokl_rizalit", -RIS_X - 0.3, RIS_X + 0.3, RIS_Y0 - 0.3, RIS_Y1,
        0.0, PLINTH_TOP, m_stone)
    box("Sokl_jeviste", -STAGE_X - 0.28, STAGE_X + 0.28, MAIN_Y1 + 0.3,
        STAGE_Y1 + 0.28, 0.0, PLINTH_TOP, m_stone)
    box("Sokl_pristavba", -ANNEX_X - 0.28, ANNEX_X + 0.28, STAGE_Y1 + 0.28,
        ANNEX_Y1 + 0.28, 0.0, PLINTH_TOP, m_stone)

    # ---- hlavní hmota ---------------------------------------------------
    # čelní a zadní stěna končí až v líci bočních stěn: dvě splývající
    # vnější plochy by se navzájem stínily a zčernaly (viz Provaziste_jadro)
    front = Facade("Celo", 'Y', MAIN_Y0, +1, -MAIN_X + WALL_T, MAIN_X - WALL_T,
                   PLINTH_TOP, MAIN_CORNICE, WALL_T, m_plaster)
    front.add_row(2.3, 2.5, WING_BAYS, 1.5)
    front.add_row(6.9, 4.3, WING_BAYS, 1.6, arched=True)
    front.build().glazing(m_glass, m_gold)

    back = Facade("Zad", 'Y', MAIN_Y1, -1, -MAIN_X + WALL_T, MAIN_X - WALL_T,
                  PLINTH_TOP, MAIN_CORNICE, WALL_T, m_plaster)
    back.add_row(2.3, 2.5, [-11.0, 11.0], 1.4)
    back.build().glazing(m_glass, m_gold)

    for sign, tag in ((-1, "Zapad"), (+1, "Vychod")):
        s = Facade(f"Bok_{tag}", 'X', sign * MAIN_X, -sign, MAIN_Y0, MAIN_Y1,
                   PLINTH_TOP, MAIN_CORNICE, WALL_T, m_plaster)
        s.add_row(2.3, 2.5, SIDE_BAYS, 1.35)
        s.add_row(6.9, 4.3, SIDE_BAYS, 1.45, arched=True)
        s.build().glazing(m_glass, m_gold)

        # rizalit schodiště v boční fasádě
        x_out = sign * (MAIN_X + STAIR_OUT)
        lo, hi = min(sign * MAIN_X, x_out), max(sign * MAIN_X, x_out)
        box(f"Sokl_schodiste_{tag}", lo - 0.18, hi + 0.18, STAIR_Y0 - 0.18,
            STAIR_Y1 + 0.18, 0.0, PLINTH_TOP, m_stone)
        r = Facade(f"Schodiste_{tag}", 'X', x_out, -sign, STAIR_Y0, STAIR_Y1,
                   PLINTH_TOP, STAIR_TOP, STAIR_OUT + 0.2, m_light)
        r.add_row(2.6, 7.4, [10.4, 12.8], 1.55, arched=True)
        r.build().glazing(m_glass, m_gold)
        deco += cornice(f"Rimsa_schodiste_{tag}", lo, hi, STAIR_Y0, STAIR_Y1,
                        STAIR_TOP, 0.42, 0.28, m_light,
                        consoles=(1.25, ('front', 'back')))

    # ---- vstupní rizalit -------------------------------------------------
    ris = Facade("Rizalit", 'Y', RIS_Y0, +1, -RIS_X, RIS_X, PLINTH_TOP,
                 RIS_CORNICE, WALL_T + 0.15, m_light)
    ris.add_row(RIS_DOOR_Z, RIS_DOOR_H, RIS_BAYS, 1.66, arched=True)
    ris.add_row(RIS_WIN_Z, RIS_WIN_H, RIS_BAYS, 1.55, arched=True)
    ris.build().glazing(m_glass, m_gold)
    for i, x in enumerate(RIS_BAYS):
        box(f"Rizalit_dvere{i}", x - 0.76, x + 0.76, RIS_Y0 + 0.34,
            RIS_Y0 + 0.46, RIS_DOOR_Z, RIS_DOOR_Z + 2.6, m_wood, "Průčelí")
    for sign, tag in ((-1, "L"), (+1, "P")):
        box(f"Rizalit_bok{tag}", sign * RIS_X - sign * WALL_T, sign * RIS_X,
            RIS_Y0, RIS_Y1, PLINTH_TOP, RIS_CORNICE, m_light, "Průčelí")

    for i, x in enumerate([-6.1, -3.6, -1.2, 1.2, 3.6, 6.1]):
        deco += pilaster(f"Pilastr_rizalit{i}", x, RIS_Y0, 0.26,
                         RIS_WIN_Z - 0.15, RIS_CORNICE, m_light, m_gold)

    # balkon nad hlavním vstupem
    box("Balkon_deska", -RIS_X - 0.55, RIS_X + 0.55, RIS_Y0 - 1.5, RIS_Y0 + 0.1,
        BALCONY_Z - 0.35, BALCONY_Z, m_light, "Průčelí")
    for i in range(9):
        x = -RIS_X - 0.25 + (2 * RIS_X + 0.5) * i / 8
        deco.append(cylinder(f"Balkon_konzola{i}", 0.155, 0.85,
                             (x, RIS_Y0 - 0.72, BALCONY_Z - 0.62),
                             rotation=(math.pi / 2, 0, 0), verts=8,
                             mat=m_light, col="Průčelí"))
    deco += balustrade("Balkon_zabradli", (-RIS_X - 0.45, RIS_Y0 - 1.35),
                       (RIS_X + 0.45, RIS_Y0 - 1.35), BALCONY_Z,
                       BALCONY_RAIL_H, m_light)

    # ---- římsy a atiky ---------------------------------------------------
    deco += cornice("Rimsa_hlavni", -MAIN_X, MAIN_X, MAIN_Y0, MAIN_Y1,
                    MAIN_CORNICE, MAIN_CORNICE_TOP - MAIN_CORNICE, 0.55,
                    m_light, consoles=(1.15, ('front', 'left', 'right')))
    deco += cornice("Rimsa_rizalit", -RIS_X, RIS_X, RIS_Y0, RIS_Y1,
                    RIS_CORNICE, RIS_CORNICE_TOP - RIS_CORNICE, 0.6,
                    m_light, consoles=(0.9, ('front', 'left', 'right')))

    deco += balustrade("Atika_celo", (-MAIN_X - 0.4, MAIN_Y0 - 0.4),
                       (MAIN_X + 0.4, MAIN_Y0 - 0.4), MAIN_CORNICE_TOP,
                       MAIN_ATTIC_TOP - MAIN_CORNICE_TOP, m_light)
    for sign in (-1, 1):
        deco += balustrade(f"Atika_bok{sign}",
                           (sign * (MAIN_X + 0.4), MAIN_Y0 - 0.4),
                           (sign * (MAIN_X + 0.4), MAIN_Y1),
                           MAIN_CORNICE_TOP, MAIN_ATTIC_TOP - MAIN_CORNICE_TOP,
                           m_light)
    # nárožní pilířky atiky se secesními maskami
    for sx in (-1, 1):
        px = sx * (MAIN_X + 0.35)
        deco.append(box(f"Atika_narozi{sx}", px - 0.55, px + 0.55,
                        MAIN_Y0 - 0.92, MAIN_Y0 + 0.22, MAIN_CORNICE_TOP,
                        MAIN_ATTIC_TOP + 0.45, m_light, "Výzdoba"))
        deco += mascaron(f"Maska_narozi{sx}", px, MAIN_Y0 - 0.94,
                         MAIN_ATTIC_TOP - 0.15, m_ceramic, m_gold, r=0.33)

    # atika rizalitu s nápisovým polem a heslem
    deco += balustrade("Atika_rizalit", (-RIS_X - 0.45, RIS_Y0 - 0.45),
                       (RIS_X + 0.45, RIS_Y0 - 0.45), RIS_CORNICE_TOP,
                       RIS_ATTIC_TOP - RIS_CORNICE_TOP, m_light)
    deco.append(box("Napisove_pole", -3.6, 3.6, RIS_Y0 - 0.66, RIS_Y0 - 0.32,
                    RIS_CORNICE_TOP - 0.05, RIS_ATTIC_TOP + 0.85, m_light,
                    "Výzdoba"))
    deco.append(box("Heslo_UMENI_SILA_ZIVOTA", -3.15, 3.15, RIS_Y0 - 0.73,
                    RIS_Y0 - 0.64, RIS_CORNICE_TOP + 0.35,
                    RIS_CORNICE_TOP + 0.82, m_gold, "Výzdoba"))
    deco += mascaron("Monogram_MD", 0.0, RIS_Y0 - 0.70,
                     RIS_CORNICE_TOP + 1.55, m_gold, m_gold, r=0.46)
    deco += statue("Thalie", 0.0, RIS_Y0 + 0.45, RIS_ATTIC_TOP + 0.85,
                   m_bronze, height=3.0)

    # ---- pylony se sochami ----------------------------------------------
    for sx, nazev in ((-1, "Probuzeni_naroda"), (1, "Vitezstvi_umeni")):
        x = sx * PYL_X
        box(f"Pylon_{nazev}_sokl", x - PYL_HALF - 0.22, x + PYL_HALF + 0.22,
            PYL_Y0 - 0.22, PYL_Y1 + 0.22, 0.0, PLINTH_TOP + 0.45, m_stone)
        box(f"Pylon_{nazev}", x - PYL_HALF, x + PYL_HALF, PYL_Y0, PYL_Y1,
            PLINTH_TOP + 0.45, PYL_TOP, m_light, "Průčelí")
        deco.append(box(f"Pylon_{nazev}_hlavice", x - PYL_HALF - 0.28,
                        x + PYL_HALF + 0.28, PYL_Y0 - 0.28, PYL_Y1 + 0.28,
                        PYL_TOP, PYL_TOP + 0.5, m_light, "Průčelí"))
        deco += festoon(f"Feston_pylon{sx}", x - PYL_HALF + 0.2,
                        x + PYL_HALF - 0.2, PYL_Y0 - 0.05, PYL_TOP - 0.95,
                        m_copper)
        deco += mascaron(f"Maska_pylon{sx}", x, PYL_Y0 - 0.05, PYL_TOP - 3.0,
                         m_ceramic, m_gold, r=0.42)
        deco += statue(f"Socha_{nazev}", x, (PYL_Y0 + PYL_Y1) / 2,
                       PYL_TOP + 0.5, m_bronze, height=3.5,
                       arm_up=(sx > 0))

    # ---- výzdoba hlavního průčelí a boků --------------------------------
    for i, x in enumerate([-11.2, -9.2, -6.95, 6.95, 9.2, 11.2]):
        deco += mascaron(f"Maska_celo{i}", x, MAIN_Y0 - 0.07, 11.45,
                         m_ceramic, m_gold)
    for i, (a, b) in enumerate([(-11.4, -9.4), (-9.0, -7.0),
                                (7.0, 9.0), (9.4, 11.4)]):
        deco += festoon(f"Feston_celo{i}", a, b, MAIN_Y0 - 0.05, 6.05, m_copper)
    for sign, tag in ((-1, "Zapad"), (1, "Vychod")):
        for i, y in enumerate(SIDE_BAYS):
            deco.append(cylinder(f"Terc_{tag}{i}", 0.27, 0.12,
                                 (sign * (MAIN_X + 0.05), y, 11.45),
                                 rotation=(0, math.pi / 2, 0), verts=16,
                                 mat=m_ceramic, col="Výzdoba"))

    # ---- jevištní část s provazištěm ------------------------------------
    # jádro se o 2 cm zanořuje pod líc fasádních stěn — kdyby plochy splývaly,
    # Cycles by je nechal vzájemně vrhat stín a stěna by se vyrenderovala černá
    box("Provaziste_jadro", -STAGE_X + WALL_T - 0.02, STAGE_X - WALL_T + 0.02,
        STAGE_Y0, STAGE_Y1 - WALL_T + 0.02, PLINTH_TOP, STAGE_CORNICE,
        m_plaster, "Hmota")
    stage = Facade("Jeviste_zad", 'Y', STAGE_Y1, -1, -STAGE_X + WALL_T,
                   STAGE_X - WALL_T, PLINTH_TOP, STAGE_CORNICE, WALL_T,
                   m_plaster)
    stage.add_row(2.3, 2.4, [-6.0, 0.0, 6.0], 1.3)
    stage.add_row(12.0, 2.4, [-6.0, 0.0, 6.0], 1.3)
    stage.build().glazing(m_glass, m_gold)
    for sign, tag in ((-1, "Z"), (1, "V")):
        s = Facade(f"Jeviste_bok{tag}", 'X', sign * STAGE_X, -sign,
                   STAGE_Y0, STAGE_Y1, PLINTH_TOP, STAGE_CORNICE, WALL_T,
                   m_plaster)
        s.add_row(2.3, 2.4, [27.0, 30.5, 34.0], 1.25)
        s.add_row(12.0, 2.4, [27.0, 30.5, 34.0], 1.25)
        s.build().glazing(m_glass, m_gold)

    deco += cornice("Rimsa_jeviste", -STAGE_X, STAGE_X, STAGE_Y0, STAGE_Y1,
                    STAGE_CORNICE, 0.5, 0.4, m_light,
                    consoles=(1.3, ('back', 'left', 'right')))

    # dvoupatrová nástavba nad jevištěm — okna a sloupy
    nz0, nz1 = STAGE_CORNICE + 0.5, STAGE_ATTIC_TOP
    box("Nastavba_jadro", -STAGE_X + 0.55, STAGE_X - 0.55, STAGE_Y0 + 0.55,
        STAGE_Y1 - 0.55, nz0, nz1, m_plaster, "Hmota")
    for i, x in enumerate([-8.3, -5.0, -1.7, 1.7, 5.0, 8.3]):
        deco.append(cylinder(f"Sloup_nastavba_zad{i}", 0.30, nz1 - nz0,
                             (x, STAGE_Y1 - 0.45, (nz0 + nz1) / 2), verts=12,
                             mat=m_light, col="Průčelí"))
        deco.append(box(f"Hlavice_nastavba{i}", x - 0.42, x + 0.42,
                        STAGE_Y1 - 0.9, STAGE_Y1 - 0.02, nz1 - 0.38, nz1,
                        m_light, "Průčelí"))
    for i, y in enumerate([26.5, 29.5, 32.5, 35.5]):
        for sign in (-1, 1):
            deco.append(cylinder(f"Sloup_nastavba_bok{sign}_{i}", 0.28,
                                 nz1 - nz0,
                                 (sign * (STAGE_X - 0.45), y, (nz0 + nz1) / 2),
                                 verts=12, mat=m_light, col="Průčelí"))
    for i, x in enumerate([-6.65, -3.35, 0.0, 3.35, 6.65]):
        deco.append(box(f"Okno_nastavba{i}", x - 0.6, x + 0.6,
                        STAGE_Y1 - 0.72, STAGE_Y1 - 0.56, nz0 + 0.85,
                        nz1 - 1.15, m_glass, "Průčelí"))
    deco += cornice("Rimsa_nastavba", -STAGE_X + 0.55, STAGE_X - 0.55,
                    STAGE_Y0 + 0.55, STAGE_Y1 - 0.55, nz1, 0.42, 0.48, m_light)

    # ---- zadní přístavba -------------------------------------------------
    box("Pristavba_jadro", -ANNEX_X + WALL_T - 0.02, ANNEX_X - WALL_T + 0.02,
        ANNEX_Y0 - 1.0, ANNEX_Y1 - WALL_T + 0.02, PLINTH_TOP, ANNEX_TOP,
        m_plaster, "Hmota")
    annex = Facade("Pristavba_zad", 'Y', ANNEX_Y1, -1, -ANNEX_X + WALL_T,
                   ANNEX_X - WALL_T, PLINTH_TOP, ANNEX_TOP, WALL_T, m_plaster)
    annex.add_row(2.3, 2.2, [-4.5, 0.0, 4.5], 1.3)
    annex.add_row(5.6, 2.0, [-4.5, 0.0, 4.5], 1.3)
    annex.build().glazing(m_glass, m_gold)
    for sign, tag in ((-1, "Z"), (1, "V")):
        a = Facade(f"Pristavba_bok{tag}", 'X', sign * ANNEX_X, -sign,
                   ANNEX_Y0, ANNEX_Y1, PLINTH_TOP, ANNEX_TOP, WALL_T, m_plaster)
        a.add_row(2.3, 2.2, [38.5, 41.5], 1.25)
        a.build().glazing(m_glass, m_gold)
    deco += cornice("Rimsa_pristavba", -ANNEX_X, ANNEX_X, ANNEX_Y0, ANNEX_Y1,
                    ANNEX_TOP, 0.38, 0.32, m_light)

    # ---- střechy ---------------------------------------------------------
    roofs.append(prism("Strecha_sedlova",
                       [(-MAIN_X - 0.65, MAIN_CORNICE_TOP - 0.15),
                        (MAIN_X + 0.65, MAIN_CORNICE_TOP - 0.15),
                        (MAIN_X + 0.65, MAIN_CORNICE_TOP + 0.3),
                        (0.0, MAIN_RIDGE),
                        (-MAIN_X - 0.65, MAIN_CORNICE_TOP + 0.3)],
                       'Y', MAIN_Y0 - 0.65, STAGE_Y0 + 0.4, m_copper))
    roofs.append(box("Hreben_hlavni", -0.2, 0.2, MAIN_Y0 - 0.7, STAGE_Y0 + 0.45,
                     MAIN_RIDGE - 0.1, MAIN_RIDGE + 0.22, m_copper, "Střechy"))
    roofs.append(prism("Strecha_mansardova",
                       [(-STAGE_X - 0.15, STAGE_ATTIC_TOP + 0.42),
                        (STAGE_X + 0.15, STAGE_ATTIC_TOP + 0.42),
                        (STAGE_X - 1.5, STAGE_MANSARD_MID),
                        (STAGE_X - 4.0, STAGE_RIDGE),
                        (-STAGE_X + 4.0, STAGE_RIDGE),
                        (-STAGE_X + 1.5, STAGE_MANSARD_MID)],
                       'Y', STAGE_Y0 + 0.4, STAGE_Y1 - 0.12, m_copper))
    roofs.append(box("Hreben_provaziste", -STAGE_X + 4.0, STAGE_X - 4.0,
                     STAGE_Y0 + 0.35, STAGE_Y1 - 0.08, STAGE_RIDGE - 0.1,
                     STAGE_RIDGE + 0.2, m_copper, "Střechy"))
    roofs.append(prism("Strecha_pristavba",
                       [(-ANNEX_X - 0.35, ANNEX_TOP + 0.38),
                        (ANNEX_X + 0.35, ANNEX_TOP + 0.38),
                        (ANNEX_X - 2.2, ANNEX_TOP + 2.3),
                        (-ANNEX_X + 2.2, ANNEX_TOP + 2.3)],
                       'Y', ANNEX_Y0, ANNEX_Y1 + 0.35, m_copper))
    roofs.append(box("Terasa_rizalit", -RIS_X - 0.2, RIS_X + 0.2, RIS_Y0,
                     RIS_Y1 + 0.3, RIS_CORNICE_TOP - 0.1,
                     RIS_CORNICE_TOP + 0.12, m_copper, "Střechy"))
    for sign in (-1, 1):
        roofs.append(prism(f"Strecha_schodiste_{sign}",
                           [(STAIR_Y0 - 0.28, STAIR_TOP + 0.42),
                            (STAIR_Y1 + 0.28, STAIR_TOP + 0.42),
                            (STAIR_Y1 - 0.55, STAIR_TOP + 1.7),
                            (STAIR_Y0 + 0.55, STAIR_TOP + 1.7)],
                           'X', min(sign * MAIN_X, sign * (MAIN_X + STAIR_OUT + 0.22)),
                           max(sign * MAIN_X, sign * (MAIN_X + STAIR_OUT + 0.22)),
                           m_copper))

    # ---- vstupní schodiště a terén --------------------------------------
    steps = []
    for i in range(5):
        z = PLINTH_TOP - (i + 1) * PLINTH_TOP / 5
        e = 0.34 * (i + 1)
        steps.append(box(f"Schod{i}", -RIS_X - e, RIS_X + e,
                         RIS_Y0 - 0.45 - e, RIS_Y0 + 0.1, z,
                         z + PLINTH_TOP / 5 + 0.02, m_stone, "Prostředí"))
    box("Teren", -70, 70, -50, 85, -0.4, 0.0, m_ground, "Prostředí")

    # ---- úklid -----------------------------------------------------------
    join(deco, "Vyzdoba_detail", "Výzdoba")
    join(roofs, "Strechy_krytina", "Střechy")
    join(steps, "Vstupni_schodiste", "Prostředí")

    root = bpy.data.objects.new("DIVADLO_MLADA_BOLESLAV", None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 6.0
    bpy.context.scene.collection.objects.link(root)
    for obj in bpy.data.objects:
        if obj is root or obj.parent or obj.type != 'MESH' or obj.name == "Teren":
            continue
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()
    return root


# --------------------------------------------------------------------------
# scéna
# --------------------------------------------------------------------------

def setup_world():
    world = bpy.data.worlds.new("Obloha")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for kind in ('MULTIPLE_SCATTERING', 'NISHITA', 'HOSEK_WILKIE'):
        try:
            sky.sky_type = kind          # Blender 5.0 přejmenoval NISHITA
            break
        except TypeError:
            continue
    sky.sun_elevation = math.radians(42)
    sky.sun_rotation = math.radians(-118)
    if hasattr(sky, "altitude"):
        sky.altitude = 220.0
    # sluneční kotouč z oblohy vypnut — přímé světlo dělá samostatná lampa,
    # jinak se scéna osvětlí dvakrát a fasáda se přepálí do bílé
    if hasattr(sky, "sun_disc"):
        sky.sun_disc = False
    if hasattr(sky, "sun_intensity"):
        sky.sun_intensity = 0.0
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.55
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])

    sun_data = bpy.data.lights.new("Slunce", type='SUN')
    sun_data.energy = 2.8
    sun_data.angle = math.radians(2.5)
    sun_data.color = (1.0, 0.958, 0.895)
    sun = bpy.data.objects.new("Slunce", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(-42))


def add_camera(name, location, target, lens=45.0):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    cam.rotation_euler = (Vector(target) - Vector(location)) \
        .to_track_quat('-Z', 'Y').to_euler()
    return cam


def setup_render(samples, quick=False):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.transmission_bounces = 4
    scene.render.resolution_x = 1000 if quick else 1600
    scene.render.resolution_y = 620 if quick else 1000
    scene.view_settings.view_transform = 'AgX'
    # expozice odměřená z renderu: medián jasu fasády sedí na střední šeď
    scene.view_settings.exposure = -1.9
    for look in ('AgX - Medium Contrast', 'AgX - Base Contrast', 'None'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue


def render(cam, filename):
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT_DIR, filename)
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print(f"  → {scene.render.filepath}.png")


# --------------------------------------------------------------------------

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    do_render = "--no-render" not in argv
    quick = "--quick" in argv
    samples = 32 if quick else 96
    if "--samples" in argv:
        samples = int(argv[argv.index("--samples") + 1])

    os.makedirs(OUT_DIR, exist_ok=True)
    print("Model: Městské divadlo Mladá Boleslav")
    reset_scene()
    build_theatre()
    setup_world()

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    print(f"  objektů: {len(meshes)}, "
          f"polygonů: {sum(len(o.data.polygons) for o in meshes)}")

    blend_path = os.path.join(OUT_DIR, "divadlo_mlada_boleslav.blend")
    glb_path = os.path.join(OUT_DIR, "divadlo_mlada_boleslav.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"  → {blend_path}")
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB',
                              export_apply=True)
    print(f"  → {glb_path}")

    if do_render:
        setup_render(samples, quick)
        for cam, name in (
            (add_camera("Kamera_nadhled", (46, -54, 27), (0, 15, 9), lens=48),
             "nahled_01_nadhled"),
            (add_camera("Kamera_pruceli", (0, -68, 12), (0, 4, 9), lens=52),
             "nahled_02_pruceli"),
            (add_camera("Kamera_bok", (-62, 34, 24), (0, 22, 10), lens=48),
             "nahled_03_bok"),
        ):
            print(f"  render {name} …")
            render(cam, name)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    print("Hotovo.")


if __name__ == "__main__":
    main()
