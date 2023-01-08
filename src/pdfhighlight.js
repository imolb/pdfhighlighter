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

// Set cookie value
function setCookie (cname, cvalue, exdays) {
  const d = new Date()
  d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000))
  const expires = 'expires=' + d.toUTCString()
  document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/; SameSite=Lax'
}

// Read cookie value
function getCookie (cname) {
  const name = cname + '='
  const decodedCookie = decodeURIComponent(document.cookie)
  const ca = decodedCookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') {
      c = c.substring(1)
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length)
    }
  }
  return null
}

// Reset all GUI elements (e.g. after failure)
function guiReset () {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'inactive')
  document.getElementById('link').replaceChildren()
  document.getElementById('link').href = ''
  document.getElementById('link').download = ''
  document.getElementById('outputPdf').setAttribute('style', 'visibility:hidden')
  document.getElementById('log').replaceChildren()
}

// Deactivate GUI elements while processing
function guiProcessing () {
  document.getElementById('generate').setAttribute('disabled', 'true')
  document.getElementById('link').setAttribute('class', 'inactive')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:hidden')
  document.getElementById('log').appendChild(document.createTextNode('processing ...'))
}

// Activate and show GUI elements when processing is done
function guiProcessed () {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'active')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:visible')
  document.getElementById('log').replaceChildren()
}

// main function called by the "Generate" button in the GUI
async function generateOutputPdf () {
  try {
    const pdfjsLib = window.pdfjsLib
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.js'

    // Disable buttons/links while processing
    guiProcessing()

    // Clear pdf view frames
    document.getElementById('outputPdf').src = 'about:blank'

    // Read input parameters from HTML form
    const searchTerm = document.getElementById('searchTerm').value
    const highlightRow = document.getElementById('highlightRow').checked
    const rgbValue = convertToRgb(document.getElementById('color').value)
    const inputFiles = document.getElementById('file').files
    const inputFile = inputFiles[0]

    // check on validity of input parameters
    if (typeof searchTerm !== 'string') {
      throw new Error('searchTerm is not a string')
    }
    if (searchTerm.length === 0) {
      throw new Error('searchTerm is empty')
    }
    if (typeof highlightRow !== 'boolean') {
      throw new Error('highlightRow is not boolean')
    }

    // Store in cookies
    setCookie('searchTerm', searchTerm, 400)
    setCookie('highlightRow', highlightRow, 400)
    setCookie('rgbValue', document.getElementById('color').value, 400)

    // Load and read the provided input file
    // and create name for output file
    // If empty, use default example
    let fileContent
    let outputFileName
    if (inputFile) {
      fileContent = await readUploadFile(inputFile)
      outputFileName = inputFile.name.replace(/\.([^.]*)$/i, '_highlighted.pdf')
    } else {
      // Fallback: read demo file from host server
      fileContent = await readHostedFile('demo.pdf')
      outputFileName = 'demo_highlighted.pdf'
    }

    // Load the document via PDFlib to modify the document
    const pdfDoc = await window.PDFLib.PDFDocument.load(fileContent)

    // Load the document again via PDF.js which supports search features within the PDF
    const loadingTask = await pdfjsLib.getDocument(fileContent)

    await loadingTask.promise.then(async function (pdfJsDoc) {
      for (let pageIdx = 1; pageIdx <= pdfJsDoc.numPages; pageIdx++) {
        await searchPage(pdfJsDoc, pageIdx, pdfDoc, searchTerm, rgbValue, highlightRow)
      }
    })

    // Create PDF as blob binary object
    const downloadPdf = await pdfDoc.save()
    const binaryData = []
    binaryData.push(downloadPdf)
    const objectURL = URL.createObjectURL(new Blob(binaryData, { type: 'application/pdf' }))

    // Show in download link
    const link = document.getElementById('link')
    link.download = outputFileName
    link.appendChild(document.createTextNode(outputFileName))
    link.href = objectURL

    // Show in iframe
    const iframe = document.getElementById('outputPdf')
    iframe.src = objectURL

    guiProcessed()
  } catch (error) {
    console.error(error)
    guiReset()
    document.getElementById('log').replaceChildren()
    document.getElementById('log').appendChild(document.createTextNode('Internal error: ' + error))

    document.getElementById('logdetails').replaceChildren()
    document.getElementById('logdetails').appendChild(document.createTextNode(error.stack))
  }
}

function initializePage () {
  guiReset()

  const searchTerm = getCookie('searchTerm')
  const highlightRow = getCookie('highlightRow')
  const rgbValue = getCookie('rgbValue')

  if (searchTerm) {
    document.getElementById('searchTerm').value = searchTerm
  }

  if (highlightRow) {
    if (highlightRow === 'true') {
      document.getElementById('highlightRow').checked = true
    } else {
      document.getElementById('highlightRow').checked = false
    }
  }

  if (rgbValue) {
    document.getElementById('color').value = rgbValue
  }

  document.getElementById('form').addEventListener('submit', generateOutputPdf)
}

window.addEventListener('load', initializePage)
