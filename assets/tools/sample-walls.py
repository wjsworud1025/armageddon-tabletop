"""Rectify the visible cast walls of the 2026 starter into a palette relief atlas.

Input is the 1024-square isolated terrain product sheet (gallery photograph 04).
Run with Python and Pillow, passing the path to a local copy of the sheet.
The calibration coordinates refer to that published angle, not a measured scan.
Source https://www.goldengoblingames.com/shop/warhammer-771/warhammer-40k-starter-set-2026-22132
"""
from base64 import b64encode
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw


def sample(image, size, quad, outline, holes=()):
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(outline, fill=255)
    for hole in holes:
        draw.polygon(hole, fill=0)
    # QUAD traverses columns from upper left down and then across.
    photo = image.transform(size, Image.Transform.QUAD, quad, Image.Resampling.BILINEAR)
    mask = mask.transform(size, Image.Transform.QUAD, quad, Image.Resampling.NEAREST)
    pixels = photo.quantize(colors=127, method=Image.Quantize.MEDIANCUT)
    palette = bytes(pixels.getpalette()[:127 * 3])
    indexes = bytes(i + 1 if a and min(rgb) < 212 else 0
                    for i, a, rgb in zip(pixels.getdata(), mask.getdata(), photo.getdata()))
    return {"width": size[0], "height": size[1],
            "palette": b64encode(palette).decode(), "index": b64encode(indexes).decode()}


def main():
    image = Image.open(sys.argv[1]).convert("RGB")
    if image.size != (1024, 1024):
        raise ValueError("Expected the isolated 1024×1024 terrain sheet")
    walls = {}
    walls["door"] = sample(image, (144, 112),
        (631, 254, 641, 436, 872, 412, 858, 235),
        [(638,435),(630,280),(634,268),(637,259),(643,258),(650,265),(654,266),
         (667,265),(672,262),(680,263),(689,267),(693,278),(702,278),(710,273),
         (719,276),(726,287),(732,292),(738,303),(747,306),(751,310),(764,314),
         (771,316),(774,322),(784,328),(796,329),(805,325),(814,331),(820,338),
         (828,340),(832,350),(839,356),(844,366),(842,379),(849,392),(852,400),
         (863,401),(871,411),(823,417),(787,419),(747,422),(733,426),(713,426),
         (689,428),(663,431),(651,435)],
        [[(680,268),(686,269),(690,277),(678,278)],
         [(678,280),(690,279),(690,293),(678,294)],
         [(694,281),(706,281),(706,291),(694,292)],
         [(694,293),(706,293),(705,301),(695,301)]])
    walls["pipe"] = sample(image, (108, 112),
        (421, 242, 422, 415, 261, 434, 255, 264),
        [(418,247),(411,247),(408,244),(399,245),(394,249),(373,251),(364,255),
         (357,260),(352,269),(346,268),(342,275),(335,273),(327,284),(324,293),
         (321,302),(319,308),(320,333),(316,343),(319,353),(311,358),(307,360),
         (304,370),(297,376),(289,378),(284,382),(276,383),(271,399),(266,406),
         (265,414),(262,424),(264,432),(291,431),(322,425),(361,421),(386,417),(420,415)],
        [[(393,255),(405,254),(405,259),(394,260)]])
    walls["inside"] = sample(image, (96, 64),
        (874, 195, 872, 272, 746, 288, 749, 211),
        [(874,194),(874,272),(746,288),(747,278),(753,271),(755,258),(761,245),
         (761,234),(770,223),(776,202),(832,198)])
    walls["shrine"] = sample(image, (72, 55),
        (452,354,452,426,573,414,570,345),
        [(452,423),(453,402),(457,392),(458,364),(466,359),(478,359),(482,352),
         (490,350),(499,353),(502,367),(509,367),(513,374),(525,373),(531,376),
         (537,372),(542,378),(550,375),(557,381),(562,380),(565,389),(568,399),(571,412)])
    walls["back"] = sample(image, (62, 56),
        (334,531,335,607,417,627,416,543),
        [(334,534),(349,535),(357,538),(368,534),(374,537),(381,533),(393,532),
         (401,535),(410,531),(414,536),(417,625),(335,607)])
    walls["shortPipe"] = sample(image, (64, 61),
        (699,535,697,616,596,637,593,555),
        [(698,541),(696,616),(613,637),(597,637),(598,624),(608,616),(608,606),
         (613,601),(615,581),(621,569),(630,572),(634,563),(644,560),(648,555),
         (654,555),(657,549),(665,550),(667,542),(675,542),(679,536),(687,539)])
    target = Path(__file__).resolve().parents[1] / "wall-survey.mjs"
    target.write_text("// Generated with assets/tools/sample-walls.py from the cited 2026 terrain sheet.\n"
                      + "export const wallSurvey = " + json.dumps(walls, separators=(",", ":")) + ";\n",
                      encoding="utf-8")


if __name__ == "__main__":
    main()
