#!/usr/bin/python3
# -*- coding: UTF-8 -*-
#
"""PDF Highlight
Highlights line in a PDF containing provided searchterm

Usage:
  {cmd} <searchterm> <inputfile> <outputfile>
  {cmd} --help

Parameter:
    <searchterm> Regular expression to search for within found words(!)
    <inputfile>
    <outputfile>

Limitations
The PDF file is assumed to be A4 portrait.

  """

import io
import re
from os.path import exists
from pathlib import Path
from docopt import docopt

from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4


# Parse inputfile for searchterm and provide outputfile with highlights
def parse_and_highlight_document(searchterm, inputfile, outputfile):
    # Open the input file via PyPDF2
    content_reader = PdfReader(inputfile)
    page_length = content_reader.getNumPages()

    # Create Output file via PyPDF2
    output_writer = PdfWriter()

    # Loop over pages of the input document
    for i in range(page_length):
        parse_and_highlight_page(searchterm, content_reader.pages[i], output_writer)

    # Write the generated file to disk
    with open(outputfile, "wb") as fp:
        output_writer.write(fp)


# Parse content_page for searchterm and add page with highlights to output_writer
def parse_and_highlight_page(searchterm, content_page, output_writer):
    # Create empty page via reportlab as StringIO buffer
    # with A4 page size and yellow fill color
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=A4)
    can.setFillColorRGB(1, 1, 0)

    # Regular expression for searchterm
    search_expression = re.compile(searchterm)

    def visitor_body(text, cm, tm, fontDict, fontSize):
        # Create round rectangle in the new empty canvas
        # for each found searchterm in the content page
        if search_expression.search(text):
            # Create the rectangle from left to right
            can.roundRect(10, tm[5] - 2, 550, 14, 3, stroke=0, fill=1)

    # Search the content page for defined searchterm
    content_page.extract_text(visitor_text=visitor_body)
    # Save the canvas of the new underlay page
    can.save()
    # move to the beginning of the StringIO buffer
    packet.seek(0)
    # create a new PDF with PyPDF2 based on the reportlab canvas StringIO buffer with the highlights
    underlay_pdf = PdfReader(packet)
    underlay_page = underlay_pdf.pages[0]
    # Add the original content to the underlay
    underlay_page.merge_page(content_page)
    underlay_page.mediabox = content_page.mediabox

    # Add the underlay_page merged with the content to the output
    output_writer.add_page(underlay_page)


# my_main to handle input arguments
def my_main():
    arguments = docopt(__doc__.format(cmd=Path(__file__).name))

    inputfile = arguments['<inputfile>']
    outputfile = arguments['<outputfile>']
    searchterm = arguments['<searchterm>']

    if not exists(inputfile):
        print("inputfile does not exist")
        return
    if len(searchterm) < 2:
        print("searchterm is not at least 3 characters")
        return
    parse_and_highlight_document(searchterm, inputfile, outputfile)


if __name__ == '__main__':
    my_main()
