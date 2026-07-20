#!/usr/bin/env python3
"""Vyrenderuje nahledy modelu PC-6 z export_mesh.build() do PNG."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np

from export_mesh import build


def render(path):
    groups = build()
    fig = plt.figure(figsize=(16, 7), dpi=110)
    views = [(20, -60, 'Isometricky pohled'), (12, -90, 'Pohled zboku')]
    for vi, (elev, azim, title) in enumerate(views):
        ax = fig.add_subplot(1, 2, vi + 1, projection='3d')
        lo = np.array([1e9] * 3)
        hi = -lo.copy()
        for comp, parts in groups.items():
            for name, mesh, color in parts:
                tri = mesh.triangles
                pc = Poly3DCollection(tri, alpha=1.0)
                pc.set_facecolor(np.array(color[:3]) / 255)
                pc.set_edgecolor('none')
                ax.add_collection3d(pc)
                lo = np.minimum(lo, mesh.bounds[0])
                hi = np.maximum(hi, mesh.bounds[1])
        center = (lo + hi) / 2
        r = (hi - lo).max() / 2
        ax.set_xlim(center[0] - r, center[0] + r)
        ax.set_ylim(center[1] - r, center[1] + r)
        ax.set_zlim(center[2] - r, center[2] + r)
        ax.set_box_aspect([1, 1, 1])
        ax.view_init(elev=elev, azim=azim)
        ax.set_title(title)
        ax.axis('off')
    fig.suptitle('RC Pilatus PC-6 Porter 1:8 - stavebnicova kostra '
                 '(62 dilu, rozpeti 1984 mm)', fontsize=14)
    fig.tight_layout()
    fig.savefig(path, bbox_inches='tight', facecolor='white')
    print('ulozeno:', path)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')
    os.makedirs(out, exist_ok=True)
    render(os.path.join(out, 'pc6_preview.png'))
