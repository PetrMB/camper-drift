# PC6PorterKit.py
# Fusion 360 script: generuje RC model Pilatus PC-6 Porter v dilech
# (stavebnicova/balsova konstrukce: zebra, nosniky, prepazky, podelniky).
#
# Meritko 1:8 -> rozpeti ~1984 mm, delka trupu ~1363 mm.
# Kazdy konstrukcni dil je samostatne telo (Body) pojmenovane jako v kitu,
# rozdelene do komponent: Wing R, Wing L, Fuselage, Tail, Landing gear,
# Struts, Cowl.
#
# Spusteni ve Fusion 360: Utilities -> Add-Ins -> Scripts and Add-Ins ->
# zelene plus -> vybrat slozku PC6PorterKit -> Run.

import adsk.core
import adsk.fusion
import traceback

# ---------------------------------------------------------------------------
# Parametry modelu (mm) - meritko 1:8 ze skutecneho PC-6
# (rozpeti 15.87 m, delka 10.9 m, plocha kridla 30.15 m2 -> hloubka ~1.9 m)
# ---------------------------------------------------------------------------
SCALE_NOTE = '1:8'

WING_SPAN = 1984.0          # celkove rozpeti
WING_CHORD = 238.0          # konstantni hloubka (obdelnikove kridlo PC-6)
WING_LE_X = 430.0           # poloha nabezne hrany od nosu trupu
WING_Z = 118.0              # vyska tetivy kridla (horni krídlo nad kabinou)
RIB_COUNT = 13              # zeber na polovinu kridla
RIB_T = 3.0                 # tloustka zebra (balsa 3 mm)
RIB_Y_START = 25.0          # prvni zebro od osy trupu
MAIN_SPAR_POS = 0.28        # hlavni nosnik v % hloubky
REAR_SPAR_POS = 0.72        # pomocny nosnik v % hloubky
SPAR_T = 5.0                # tloustka stojiny nosniku
LE_SQ = 8.0                 # nabezna lista 8x8
TE_W = 20.0                 # odtokova lista sirka
TE_T = 6.0                  # odtokova lista tloustka

FUSE_LEN = 1330.0           # nos -> zaverova prepazka (ocasni pilir)
FIREWALL_X = 180.0          # motorova prepazka (prekryta krytem motoru)
FORMER_T = 3.0              # tloustka prepazek (F1 = prekliz 5 mm)
FIREWALL_T = 5.0
LONGERON_SQ = 6.0           # podelniky 6x6 (smrk)

# stanice trupu: (x, sirka, vyska, z-stred)  - kabina konstantni, pak kuzel
CABIN_W, CABIN_H, CABIN_ZC = 150.0, 210.0, 10.0
TAIL_W, TAIL_H, TAIL_ZC = 20.0, 55.0, 35.0
CABIN_END_X = 600.0
FORMER_STATIONS = [180.0, 320.0, 460.0, 600.0, 780.0, 960.0, 1140.0, 1330.0]

STAB_SPAN = 620.0           # rozpeti VOP
STAB_ROOT = 150.0
STAB_TIP = 100.0
STAB_LE_X = 1150.0
STAB_Z = 70.0
TAIL_T = 6.0                # balsa 6 mm, ocasni plochy z desky
ELEV_W = 60.0               # hloubka vyskovky
FIN_H = 250.0               # vyska SOP nad VOP
RUD_W = 70.0                # hloubka smerovky

GEAR_TRACK = 375.0          # rozchod (3 m / 8)
WHEEL_D = 90.0
WHEEL_W = 24.0
STRUT_W, STRUT_T = 25.0, 6.0

# Clark Y (standardni profil pro RC makety) - x/c, y/c
CLARK_Y_UPPER = [
    (0.0, 0.0), (0.0125, 0.0293), (0.025, 0.0402), (0.05, 0.0553),
    (0.075, 0.0664), (0.10, 0.0747), (0.15, 0.0868), (0.20, 0.0941),
    (0.30, 0.1002), (0.40, 0.0983), (0.50, 0.0898), (0.60, 0.0771),
    (0.70, 0.0610), (0.80, 0.0428), (0.90, 0.0224), (0.95, 0.0119),
    (1.0, 0.0012),
]
CLARK_Y_LOWER = [
    (0.0, 0.0), (0.0125, -0.0158), (0.025, -0.0227), (0.05, -0.0301),
    (0.075, -0.0333), (0.10, -0.0342), (0.15, -0.0335), (0.20, -0.0304),
    (0.30, -0.0239), (0.40, -0.0180), (0.50, -0.0140), (0.60, -0.0100),
    (0.70, -0.0065), (0.80, -0.0039), (0.90, -0.0016), (0.95, -0.0006),
    (1.0, 0.0),
]

_app = None
_ui = None


def mm(v):
    """mm -> interni jednotky Fusionu (cm)."""
    return v / 10.0


def pt(x, y, z):
    return adsk.core.Point3D.create(mm(x), mm(y), mm(z))


def new_component(root, name):
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    occ.component.name = name
    return occ.component


def offset_plane(comp, base_plane, offset_mm):
    planes = comp.constructionPlanes
    inp = planes.createInput()
    inp.setByOffset(base_plane, adsk.core.ValueInput.createByReal(mm(offset_mm)))
    return planes.add(inp)


def largest_profile(sketch):
    best, best_area = None, -1.0
    for i in range(sketch.profiles.count):
        p = sketch.profiles.item(i)
        area = p.areaProperties(
            adsk.fusion.CalculationAccuracy.LowCalculationAccuracy).area
        if area > best_area:
            best, best_area = p, area
    return best


def extrude_profile(comp, profile, thickness_mm, name):
    """Symetricke vytazeni profilu, vraci nove telo."""
    ext = comp.features.extrudeFeatures
    inp = ext.createInput(
        profile, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    inp.setSymmetricExtent(
        adsk.core.ValueInput.createByReal(mm(thickness_mm)), True)
    feat = ext.add(inp)
    body = feat.bodies.item(0)
    body.name = name
    return body


def sketch_rect(sketch, c1, c2):
    p1 = sketch.modelToSketchSpace(c1)
    p2 = sketch.modelToSketchSpace(c2)
    sketch.sketchCurves.sketchLines.addTwoPointRectangle(p1, p2)


def beam_x(comp, x1, x2, yz1, yz2, size_wh, name):
    """Sikmy nosnik/podelnik mezi dvema YZ rovinami (loft dvou obdelniku).

    yz1/yz2 = (y, z) stredu prurezu na krajich, size_wh = (sirka_y, vyska_z).
    """
    w, h = size_wh
    profs = []
    for x, (y, z) in ((x1, yz1), (x2, yz2)):
        plane = offset_plane(comp, comp.yZConstructionPlane, x)
        sk = comp.sketches.add(plane)
        sketch_rect(sk, pt(x, y - w / 2, z - h / 2), pt(x, y + w / 2, z + h / 2))
        profs.append(sk.profiles.item(0))
    lofts = comp.features.loftFeatures
    li = lofts.createInput(adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    li.loftSections.add(profs[0])
    li.loftSections.add(profs[1])
    feat = lofts.add(li)
    body = feat.bodies.item(0)
    body.name = name
    return body


def beam_y(comp, y1, y2, xz1, xz2, size_wh, name):
    """Sikmy nosnik mezi dvema XZ rovinami (vzpery, nohy podvozku)."""
    w, h = size_wh
    profs = []
    for y, (x, z) in ((y1, xz1), (y2, xz2)):
        plane = offset_plane(comp, comp.xZConstructionPlane, y)
        sk = comp.sketches.add(plane)
        sketch_rect(sk, pt(x - w / 2, y, z - h / 2), pt(x + w / 2, y, z + h / 2))
        profs.append(sk.profiles.item(0))
    lofts = comp.features.loftFeatures
    li = lofts.createInput(adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    li.loftSections.add(profs[0])
    li.loftSections.add(profs[1])
    feat = lofts.add(li)
    body = feat.bodies.item(0)
    body.name = name
    return body


def cut_notches(comp, targets, tools):
    """Vyrizne do cilovych dilu (zebra/prepazky) drazky pro nosniky/podelniky.

    Reze po dvojicich, aby nastroj minouci cilovy dil nezrusil cely rez.
    """
    combines = comp.features.combineFeatures
    for target in targets:
        for tool in tools:
            col = adsk.core.ObjectCollection.create()
            col.add(tool)
            try:
                ci = combines.createInput(target, col)
                ci.operation = adsk.fusion.FeatureOperations.CutFeatureOperation
                ci.isKeepToolBodies = True
                combines.add(ci)
            except Exception:
                # dil se s timto nastrojem neprotina -> drazka neni potreba
                pass


def airfoil_points(chord_mm, le_x, z_base, y):
    """Body profilu Clark Y v modelovych souradnicich (od odtokove hrany
    po horni strane k nabezne a zpet po spodni)."""
    pts = []
    for xc, yc in reversed(CLARK_Y_UPPER):
        pts.append(pt(le_x + xc * chord_mm, y, z_base + yc * chord_mm))
    for xc, yc in CLARK_Y_LOWER[1:]:
        pts.append(pt(le_x + xc * chord_mm, y, z_base + yc * chord_mm))
    return pts


def build_rib(comp, y, index, side_label):
    plane = offset_plane(comp, comp.xZConstructionPlane, y)
    sk = comp.sketches.add(plane)
    pts = airfoil_points(WING_CHORD, WING_LE_X, WING_Z, y)
    col = adsk.core.ObjectCollection.create()
    for p in pts:
        col.add(sk.modelToSketchSpace(p))
    spline = sk.sketchCurves.sketchFittedSplines.add(col)
    # uzavrit odtokovou hranu
    sk.sketchCurves.sketchLines.addByTwoPoints(
        spline.endSketchPoint, spline.startSketchPoint)
    prof = largest_profile(sk)
    return extrude_profile(comp, prof, RIB_T,
                           'Zebro %s%d (balsa 3mm)' % (side_label, index))


def airfoil_zrange(pos):
    """(z_dolni, z_horni) profilu v dane pozici x/c - pro vysku nosniku."""
    def interp(table):
        for i in range(len(table) - 1):
            x0, y0 = table[i]
            x1, y1 = table[i + 1]
            if x0 <= pos <= x1:
                t = (pos - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return table[-1][1]
    return (interp(CLARK_Y_LOWER) * WING_CHORD,
            interp(CLARK_Y_UPPER) * WING_CHORD)


def build_wing(root, side):
    """side = +1 prave, -1 leve kridlo."""
    label = 'R' if side > 0 else 'L'
    comp = new_component(root, 'Kridlo %s' % label)

    half = WING_SPAN / 2.0
    ys = []
    ribs = []
    for i in range(RIB_COUNT):
        y = side * (RIB_Y_START + i * (half - RIB_Y_START) / (RIB_COUNT - 1))
        ys.append(y)
        ribs.append(build_rib(comp, y, i + 1, label))

    y_in, y_out = ys[0], ys[-1]
    spars = []

    # hlavni nosnik - svisla stojina v 28 % hloubky
    zlo, zhi = airfoil_zrange(MAIN_SPAR_POS)
    x_spar = WING_LE_X + MAIN_SPAR_POS * WING_CHORD
    spars.append(beam_y(
        comp, y_in, y_out,
        (x_spar, WING_Z + (zlo + zhi) / 2), (x_spar, WING_Z + (zlo + zhi) / 2),
        (SPAR_T, (zhi - zlo) * 0.9),
        'Hlavni nosnik %s (smrk/prekliz)' % label))

    # pomocny (zadni) nosnik v 72 %
    zlo2, zhi2 = airfoil_zrange(REAR_SPAR_POS)
    x_rspar = WING_LE_X + REAR_SPAR_POS * WING_CHORD
    spars.append(beam_y(
        comp, y_in, y_out,
        (x_rspar, WING_Z + (zlo2 + zhi2) / 2), (x_rspar, WING_Z + (zlo2 + zhi2) / 2),
        (SPAR_T, (zhi2 - zlo2) * 0.9),
        'Pomocny nosnik %s' % label))

    # nabezna lista 8x8
    spars.append(beam_y(
        comp, y_in, y_out,
        (WING_LE_X + 2, WING_Z + 2), (WING_LE_X + 2, WING_Z + 2),
        (LE_SQ, LE_SQ), 'Nabezna lista %s (balsa 8x8)' % label))

    # odtokova lista
    x_te = WING_LE_X + WING_CHORD - TE_W / 2
    spars.append(beam_y(
        comp, y_in, y_out,
        (x_te, WING_Z + 1), (x_te, WING_Z + 1),
        (TE_W, TE_T), 'Odtokova lista %s (brousi se do klinu)' % label))

    # drazky v zebrech pro nosniky a listy
    cut_notches(comp, ribs, spars)
    return comp


def former_dims(x):
    """Rozmery prepazky ve stanici x (kabina konstantni, pak linearni kuzel)."""
    if x <= CABIN_END_X:
        return CABIN_W, CABIN_H, CABIN_ZC
    t = (x - CABIN_END_X) / (FUSE_LEN - CABIN_END_X)
    w = CABIN_W + t * (TAIL_W - CABIN_W)
    h = CABIN_H + t * (TAIL_H - CABIN_H)
    zc = CABIN_ZC + t * (TAIL_ZC - CABIN_ZC)
    return w, h, zc


def build_former(comp, x, index):
    w, h, zc = former_dims(x)
    plane = offset_plane(comp, comp.yZConstructionPlane, x)
    sk = comp.sketches.add(plane)
    sketch_rect(sk, pt(x, -w / 2, zc - h / 2), pt(x, w / 2, zc + h / 2))
    is_firewall = (index == 1)
    if not is_firewall and min(w, h) > 45:
        # odlehcovaci otvor
        sk.sketchCurves.sketchCircles.addByCenterRadius(
            sk.modelToSketchSpace(pt(x, 0, zc)), mm(min(w, h) * 0.225))
    prof = largest_profile(sk)
    if is_firewall:
        return extrude_profile(comp, prof, FIREWALL_T,
                               'F1 motorova prepazka (prekliz 5mm)')
    return extrude_profile(comp, prof, FORMER_T,
                           'F%d prepazka (balsa/prekliz 3mm)' % index)


def build_fuselage(root):
    comp = new_component(root, 'Trup')
    formers = []
    for i, x in enumerate(FORMER_STATIONS):
        formers.append(build_former(comp, x, i + 1))

    # 4 podelniky, kazdy ve dvou primych segmentech (kabina + kuzel)
    longerons = []
    ins = LONGERON_SQ / 2.0
    for sy in (1, -1):
        for sz in (1, -1):
            pts_key = []
            for x in (FORMER_STATIONS[0], CABIN_END_X, FUSE_LEN):
                w, h, zc = former_dims(x)
                pts_key.append((x, sy * (w / 2 - ins), zc + sz * (h / 2 - ins)))
            name = 'Podelnik %s%s' % ('P' if sy > 0 else 'L',
                                      'h' if sz > 0 else 'd')
            (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = pts_key
            longerons.append(beam_x(
                comp, x0, x1, (y0, z0), (y1, z1),
                (LONGERON_SQ, LONGERON_SQ), name + ' - kabina (smrk 6x6)'))
            longerons.append(beam_x(
                comp, x1, x2, (y1, z1), (y2, z2),
                (LONGERON_SQ, LONGERON_SQ), name + ' - kuzel (smrk 6x6)'))

    # drazky v prepazkach pro podelniky
    cut_notches(comp, formers, longerons)
    return comp


def build_tail(root):
    comp = new_component(root, 'Ocasni plochy')

    # VOP - stabilizator (lichobeznik) na vodorovne rovine
    plane = offset_plane(comp, comp.xYConstructionPlane, STAB_Z)
    sk = comp.sketches.add(plane)
    te_x = STAB_LE_X + STAB_ROOT
    sweep = STAB_ROOT - STAB_TIP
    outline = [
        pt(STAB_LE_X, 0, STAB_Z),
        pt(STAB_LE_X + sweep, STAB_SPAN / 2, STAB_Z),
        pt(te_x, STAB_SPAN / 2, STAB_Z),
        pt(te_x, -STAB_SPAN / 2, STAB_Z),
        pt(STAB_LE_X + sweep, -STAB_SPAN / 2, STAB_Z),
    ]
    for i in range(len(outline)):
        sk.sketchCurves.sketchLines.addByTwoPoints(
            sk.modelToSketchSpace(outline[i]),
            sk.modelToSketchSpace(outline[(i + 1) % len(outline)]))
    extrude_profile(comp, largest_profile(sk), TAIL_T,
                    'Stabilizator VOP (balsa 6mm)')

    # vyskovka - deska za odtokovou hranou VOP
    sk2 = comp.sketches.add(plane)
    sketch_rect(sk2, pt(te_x + 2, -STAB_SPAN / 2, STAB_Z),
                pt(te_x + 2 + ELEV_W, STAB_SPAN / 2, STAB_Z))
    extrude_profile(comp, largest_profile(sk2), TAIL_T,
                    'Vyskovka (balsa 6mm, zavesy)')

    # SOP - kyl na svisle rovine (y=0)
    sk3 = comp.sketches.add(comp.xZConstructionPlane)
    fin_base_x = STAB_LE_X
    fin_te_x = te_x
    fin_top = STAB_Z + FIN_H
    fin_outline = [
        pt(fin_base_x, 0, STAB_Z),
        pt(fin_base_x + 70, 0, fin_top),
        pt(fin_te_x, 0, fin_top),
        pt(fin_te_x, 0, STAB_Z),
    ]
    for i in range(len(fin_outline)):
        sk3.sketchCurves.sketchLines.addByTwoPoints(
            sk3.modelToSketchSpace(fin_outline[i]),
            sk3.modelToSketchSpace(fin_outline[(i + 1) % len(fin_outline)]))
    extrude_profile(comp, largest_profile(sk3), TAIL_T, 'Kyl SOP (balsa 6mm)')

    # smerovka
    sk4 = comp.sketches.add(comp.xZConstructionPlane)
    rud_outline = [
        pt(fin_te_x + 2, 0, STAB_Z - 20),
        pt(fin_te_x + 2, 0, fin_top),
        pt(fin_te_x + 2 + RUD_W, 0, fin_top - 40),
        pt(fin_te_x + 2 + RUD_W, 0, STAB_Z - 20),
    ]
    for i in range(len(rud_outline)):
        sk4.sketchCurves.sketchLines.addByTwoPoints(
            sk4.modelToSketchSpace(rud_outline[i]),
            sk4.modelToSketchSpace(rud_outline[(i + 1) % len(rud_outline)]))
    extrude_profile(comp, largest_profile(sk4), TAIL_T,
                    'Smerovka (balsa 6mm, zavesy)')
    return comp


def build_gear(root):
    comp = new_component(root, 'Podvozek')
    _, _, zc = former_dims(FIREWALL_X)
    z_fuse_bottom = CABIN_ZC - CABIN_H / 2
    axle_z = z_fuse_bottom - 155.0
    for sy in (1, -1):
        label = 'P' if sy > 0 else 'L'
        beam_y(comp, sy * 40.0, sy * GEAR_TRACK / 2,
               (430.0, z_fuse_bottom), (430.0, axle_z),
               (STRUT_W, STRUT_T),
               'Podvozkova noha %s (dural/laminat)' % label)
        # kolo
        plane = offset_plane(comp, comp.xZConstructionPlane,
                             sy * (GEAR_TRACK / 2 + WHEEL_W / 2 + 3))
        sk = comp.sketches.add(plane)
        sk.sketchCurves.sketchCircles.addByCenterRadius(
            sk.modelToSketchSpace(
                pt(430.0, sy * (GEAR_TRACK / 2 + WHEEL_W / 2 + 3), axle_z)),
            mm(WHEEL_D / 2))
        extrude_profile(comp, largest_profile(sk), WHEEL_W, 'Kolo %s' % label)
    # ostruhove kolecko
    plane = offset_plane(comp, comp.xZConstructionPlane, 0)
    sk = comp.sketches.add(plane)
    sk.sketchCurves.sketchCircles.addByCenterRadius(
        sk.modelToSketchSpace(pt(1290.0, 0, TAIL_ZC - TAIL_H / 2 - 25)),
        mm(16.0))
    extrude_profile(comp, largest_profile(sk), 12.0, 'Ostruhove kolecko')
    return comp


def build_struts(root):
    comp = new_component(root, 'Vzpery kridla')
    z_fuse_bottom = CABIN_ZC - CABIN_H / 2 + 15
    x_mid = WING_LE_X + 0.35 * WING_CHORD
    for sy in (1, -1):
        label = 'P' if sy > 0 else 'L'
        beam_y(comp, sy * 70.0, sy * (WING_SPAN / 2 * 0.62),
               (x_mid, z_fuse_bottom), (x_mid, WING_Z - 4),
               (STRUT_W, STRUT_T),
               'Vzpera %s (typicka pro PC-6)' % label)
    return comp


def build_cowl(root):
    comp = new_component(root, 'Kryt motoru')
    w, h, zc = former_dims(FIREWALL_X)
    body = beam_x(comp, 25.0, FIREWALL_X, (0, zc - 12), (0, zc),
                  (w * 0.8, h * 0.75), '_cowl_tmp')
    body.name = 'Kryt motoru (laminat/balsa, dl. nos PC-6)'
    return comp


def run(context):
    global _app, _ui
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface

        doc = _app.documents.add(
            adsk.core.DocumentTypes.FusionDesignDocumentType)
        design = adsk.fusion.Design.cast(_app.activeProduct)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        root = design.rootComponent
        root.name = 'PC-6 Porter RC kit %s' % SCALE_NOTE

        build_wing(root, +1)
        build_wing(root, -1)
        build_fuselage(root)
        build_tail(root)
        build_gear(root)
        build_struts(root)
        build_cowl(root)

        _app.activeViewport.fit()
        _ui.messageBox(
            'PC-6 Porter %s vygenerovan v dilech:\n'
            '- 2x kridlo: %d zeber, hlavni + pomocny nosnik, nabezna a '
            'odtokova lista (drazky vyrezany)\n'
            '- trup: %d prepazek + 8 segmentu podelniku\n'
            '- ocasni plochy, podvozek, vzpery, kryt motoru\n\n'
            'Rozpeti %.0f mm, delka ~%.0f mm.' % (
                SCALE_NOTE, RIB_COUNT, len(FORMER_STATIONS),
                WING_SPAN, FUSE_LEN))
    except Exception:
        if _ui:
            _ui.messageBox('Chyba:\n{}'.format(traceback.format_exc()))
