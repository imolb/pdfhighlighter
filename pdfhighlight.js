function convertToRgb (str) {
  if (str.charAt(0) !== '#' || str.length !== 7) {
    throw new Error('Only six-digit hex colors are allowed prefixed with #.')
  }
  const aRgbHex = str.substring(1, 7).match(/.{1,2}/g)
  const rgbValue = window.PDFLib.rgb(parseInt(aRgbHex[0], 16) / 255,
    parseInt(aRgbHex[1], 16) / 255,
    parseInt(aRgbHex[2], 16) / 255)
  return rgbValue
}

function highlightOutputPdf (pdfDoc, pageIdx, width, height, positionX, positionY, rgbValue, highlightRow) {
  if (highlightRow) {
    positionX = 0
    width = 1500
  }

  pdfDoc.getPage(pageIdx - 1).drawRectangle({
    x: positionX,
    y: positionY,
    height,
    width,
    color: rgbValue,
    blendMode: window.PDFLib.BlendMode.Darken
  })
}

async function searchPage (pdfJsDoc, pageIdx, pdfDoc, searchTerm, rgbValue, highlightRow) {
  const page = await pdfJsDoc.getPage(pageIdx)
  const content = await page.getTextContent()
  const re = new RegExp('(.{0,20})' + searchTerm + '(.{0,20})', 'gi')

  content.items.forEach(async function (textItem) {
    if (re.exec(textItem.str)) {
      highlightOutputPdf(pdfDoc, pageIdx, textItem.width, textItem.height,
        textItem.transform[4], textItem.transform[5], rgbValue, highlightRow)
    }
  })
}

// Read file from host/server
async function readHostedFile (fileName) {
  if (!fileName) return

  const fileContent = await fetch(fileName).then(res => res.arrayBuffer())
  return fileContent
}

// Read uploaded file
async function readUploadFile (inputFile) {
  if (!inputFile) return

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(inputFile)
  })
}

function guiReset() {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'inactive')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:hidden')
}

function guiProcessing() {
  document.getElementById('generate').setAttribute('disabled', 'true')
  document.getElementById('link').setAttribute('class', 'inactive')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:hidden')
}

function guiProcessed() {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'active')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:visible')
}

// main function called by the "Generate" button in the GUI
async function generateOutputPdf () {
  const pdfjsLib = window.pdfjsLib
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.js'

  // Disable buttons/links while processing
  guiProcessing()

  // Clear pdf view frames
  document.getElementById('outputPdf').src = 'about:blank'

  // Read input parameters from HTML form
  // TODO check on validity of input parameters
  const searchTerm = document.getElementById('searchTerm').value
  const highlightRow = document.getElementById('highlightRow').checked
  const rgbValue = convertToRgb(document.getElementById('color').value)
  const inputFiles = document.getElementById('file').files
  const inputFile = inputFiles[0]

  // Load and read the provided input file
  // If empty, use default example
  // TODO replace defautl example with proper example
  let fileContent
  if (inputFile) {
    fileContent = await readUploadFile(inputFile)
  } else {
    // Fallback: read demo file from host server
    fileContent = await readHostedFile('demo.pdf')
  }

  // Load the document via PDFlib to modify the document
  const pdfDoc = await window.PDFLib.PDFDocument.load(fileContent)
  
  // Load the document again via PDF.js which supports search features within the PDF
  const loadingTask = await pdfjsLib.getDocument(fileContent)

  await loadingTask.promise.then(async function (pdfJsDoc) {
    for (let pageIdx = 1; pageIdx <= pdfJsDoc.numPages; pageIdx++) {
      await searchPage(pdfJsDoc, pageIdx, pdfDoc, searchTerm, rgbValue, highlightRow)
    }
  }).catch(console.error)

  // show generated PDF in right frame
  // TODO: 2x outputPdfDoc.save bzw. saveAsBase64; avoid one?
  const pdfDataUri = await pdfDoc.saveAsBase64({ dataUri: true })
  const iframe = document.getElementById('outputPdf');
  iframe.src = pdfDataUri

  // Update download link
  const downloadPdf = await pdfDoc.save()
  const link = document.getElementById('link')
  link.download = 'highlighted.pdf'
  const binaryData = []
  binaryData.push(downloadPdf)
  link.href = URL.createObjectURL(new Blob(binaryData, { type: 'application/pdf' }))

  guiProcessed();
}
