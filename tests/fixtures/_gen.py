"""
Regenerate the real-world Office fixtures used by tests/office-roundtrip.test.js.

The fixtures are checked in so the suite runs without Python. They are built here with
python-docx / openpyxl / python-pptx because those libraries write the same structures
real Word, Excel and PowerPoint files have — most importantly placeholders that inherit
their position from the slide layout instead of carrying an explicit <a:xfrm>.

    pip install python-docx openpyxl python-pptx
    python3 tests/fixtures/_gen.py
"""
import pathlib
from docx import Document
from docx.shared import Pt
from openpyxl import Workbook
from openpyxl.styles import Font
from pptx import Presentation
from pptx.util import Inches

here = pathlib.Path(__file__).parent

# --- Word: heading, bold run, numbered list, a real table -------------------
doc = Document()
doc.add_heading('Quarterly Revenue Report', level=1)
p = doc.add_paragraph('Prepared by the finance team. ')
p.add_run('All figures are unaudited.').bold = True
doc.add_paragraph('North region leads on growth.')
doc.add_paragraph('Margins improved on services.')
table = doc.add_table(rows=3, cols=3)
table.style = 'Table Grid'
for r, row in enumerate([('Item', 'Qty', 'Price'), ('Widget', '2', '9.99'), ('Gadget', '5', '24.50')]):
    for c, value in enumerate(row):
        table.cell(r, c).text = value
doc.save(here / 'real.docx')

# --- Excel: headers, numbers, formula, second sheet -------------------------
wb = Workbook()
ws = wb.active
ws.title = 'Sales'
ws.append(['Item', 'Qty', 'Price', 'Total'])
ws['A1'].font = Font(bold=True)
ws.append(['Widget', 2, 9.99, '=B2*C2'])
ws.append(['Gadget', 5, 24.5, '=B3*C3'])
ws.column_dimensions['A'].width = 18
second = wb.create_sheet('Notes')
second['A1'] = 'Totals exclude tax.'
wb.save(here / 'real.xlsx')

# --- PowerPoint: title slide plus a two-bullet slide ------------------------
prs = Presentation()
title = prs.slides.add_slide(prs.slide_layouts[0])
title.shapes.title.text = 'Quarterly Review'
title.placeholders[1].text = 'Finance team'
body = prs.slides.add_slide(prs.slide_layouts[1])
body.shapes.title.text = 'Highlights'
frame = body.placeholders[1].text_frame
frame.text = 'Revenue up 12 percent'
frame.add_paragraph().text = 'Costs held flat'
prs.save(here / 'real.pptx')
print('fixtures regenerated')
