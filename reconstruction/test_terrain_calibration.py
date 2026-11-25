import itertools
import unittest

import cv2
import numpy as np

from calibrate import align_high_ring, matrices
from reconstruct import Camera, HELD_OUT, apply_lens, carving_mask


class TerrainCalibrationTests(unittest.TestCase):
    def test_aperture_margin_preserves_outer_edge_and_open_notch(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[2:18, 2:18] = True
        mask[8:11, 8:11] = False
        mask[3:5, 2:6] = False
        cut = carving_mask(mask, 2)
        self.assertTrue(cut[2, 2])
        self.assertTrue(cut[4, 6])
        self.assertFalse(cut[9, 6])
        self.assertTrue(cut[9, 5])
        np.testing.assert_array_equal(carving_mask(mask, 0), mask)

    def test_high_camera_recovery_excludes_validation_images(self):
        size = 320
        params = np.array([[.5,.75,.53,.10,.02,0,14.],
                           [.5,.68,.53,.52,.02,0,14.],
                           [.5,.68,.53,1.05,.02,0,14.]])
        _, eyes, rights, downs = matrices(params)
        solids = [np.array(list(itertools.product(xs, ys, zs))) for xs, ys, zs in (
            ((-.55,.55), (0,.12), (-.22,.22)),
            ((-.5,-.28), (.08,.86), (-.12,.12)),
            ((-.46,.3), (.65,.86), (-.18,.12)))]
        vertices = np.concatenate(solids)
        views, settings, expected = [], {}, []
        for i in range(36):
            ring, frame = divmod(i, 12)
            x, y, scale, *_, distance = params[ring]
            tag = f'{ring+1:02}-{frame+1:02}'
            view = Camera(np.zeros((size,size,3),'u1'), None, eyes[i], rights[i], downs[i],
                          np.array([x,y])*size, scale*size, tag, distance)
            mask = np.zeros((size,size),'u1')
            for solid in solids:
                u, v, _ = view.project(solid)
                pts = np.stack([u,v],axis=1).round().astype('i4')
                cv2.fillConvexPoly(mask, cv2.convexHull(pts), 1)
            view.mask = mask.astype(bool)
            if tag in HELD_OUT:
                view.mask[:] = False
            views.append(view)
            if ring == 2:
                expected.append(np.stack(view.project(vertices)[:2]))
                y += .12
                scale *= 1.1
            settings[tag] = dict(center=[x,y], scale=scale, distance=distance,
                                 eye=eyes[i], right=rights[i], down=downs[i])
        def error():
            actual = [np.stack(v.project(vertices)[:2]) for v in views[24:]]
            return np.abs(np.asarray(actual)-expected).mean()
        apply_lens(views, settings)
        before = error()
        apply_lens(views, align_high_ring(views, settings, HELD_OUT))
        self.assertLess(error(), before / 5)
        self.assertLess(error(), 3.0)


if __name__ == '__main__':
    unittest.main()
