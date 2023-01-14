/**
 * pdfhighlight.js
 *
 * https://github.com/imolb/pdfhighlighter
 *
 */

/**
 * Convert 7 digit color string into PDFLib.rgb object
 *
 * @param {string} str - color string starting with # and 6 hex-digits e.g. #0A33FF
 * @return {PDFlib.rgb} - rgb object of the PDFLib representing the color
 */
function convertToRgb (str) {
  if (str.length !== 7 || str.charAt(0) !== '#') {
    throw new Error('Only six-digit hex colors are allowed prefixed with #.')
  }
  const aRgbHex = str.substring(1, 7).match(/.{1,2}/g)
  const rgbValue = window.PDFLib.rgb(parseInt(aRgbHex[0], 16) / 255,
    parseInt(aRgbHex[1], 16) / 255,
    parseInt(aRgbHex[2], 16) / 255)
  return rgbValue
}

/**
 * Adds rectangle in PDF document
 *
 * @param {PDFLib.PDFDocument} pdfDoc - object of the PDFLib representing the PDF document to modify
 * @param {number} pageIdx - page number within the PDF document to place the rectangle
 * @param {number} width - widht of the rectangle
 * @param {number} height - height of the rectangle
 * @param {number} positionX - X coordinate of the rectangle
 * @param {number} positionY - Y coordinate of the rectangle
 * @param {PDFLib.rgb} rgbValue - background color of the rectangle
 * @param {boolean} highlightRow - if true width and positionX are neglected and the rectangle is drawn over the whole page
 * @return {void}
 */
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

/**
 * Searches for text in PDF document page and highlights the found positions using {@link highlightOutputPdf}
 *
 * @async
 * @param {pdfjslib.PDFDocument} pdfJsDoc - object of the pdfjslib representing the PDF document to search in
 * @param {number} pageIdx - page number within the PDF document to search in
 * @param {PDFLib.PDFDocument} pdfDoc - object of the PDFLib representing the PDF document to add highlights as rectangles
 * @param {string} searchTerm - String to search for
 * @param {PDFLib.rgb} rgbValue - background color of the rectangle
 * @param {boolean} highlightRow - if true width and positionX are neglected and the rectangle is drawn over the whole page
 * @return {void}
 */
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

/**
 * Read a file from a host (server)
 *
 * @param {string} fileName - URL of the file to load
 * @return {ArrayBuffer} - Content of the read file
 */
async function readHostedFile (fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Input fileName is not a string')
  }

  const fileContent = await fetch(fileName).then(res => res.arrayBuffer())
  return fileContent
}

/**
 * Read file provided as upload by the client
 *
 * @param {object} fileName - object as provided from DOM <input type="file"> element
 * @return {string} - base64 encoded string representing the file
 */
async function readUploadFile (inputFile) {
  if (!inputFile) return

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(inputFile)
  })
}

/**
 * Set a cookie in the browser
 *
 * @param {string} cname - name of the cookie parameter
 * @param {string} cvalue - value of the cookie parameter
 * @param {number} exdays - number of days from now when the cookie shall expire
 * @return {void}
 */
function setCookie (cname, cvalue, exdays) {
  const d = new Date()
  d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000))
  const expires = 'expires=' + d.toUTCString()
  document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/; SameSite=Lax'
}

/**
 * Read a cookie value from the browser
 *
 * @param {string} cname - name of the cookie parameter
 * @return {string} - value of the cookie parameter, null if not found
 */
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

/**
 * Set all GUI elements in the browser to default values
 *
 * @return {void}
 */
function guiReset () {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'inactive')
  document.getElementById('link').replaceChildren()
  document.getElementById('link').href = ''
  document.getElementById('link').download = ''
  document.getElementById('outputPdf').setAttribute('style', 'visibility:hidden')
  document.getElementById('outputPdf').src = 'about:blank'
  document.getElementById('log').removeAttribute('class')
  document.getElementById('log').replaceChildren()
  document.getElementById('logdetails').replaceChildren()
}

/**
 * Set GUI elements in the browser while the PDF is processed (deactivation of elements and processing indication)
 *
 * @return {void}
 */
function guiProcessing () {
  document.getElementById('generate').setAttribute('disabled', 'true')
  document.getElementById('log').appendChild(document.createTextNode('processing ...'))
}

/**
 * Set GUI elements in the browser when the PDF is processed (make result elements visible and elements active)
 *
 * @return {void}
 */
function guiProcessed () {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'active')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:visible')
  document.getElementById('log').replaceChildren()
}

/**
 * Call back function of the generate button in the GUI
 * The function will perform the following steps
 * - Load the PDF document by {@link readHostedFile} or {@link readUploadFile}
 * - Search for the term and highlight the found searc term by {@link searchPage}
 * - Show the result
 *
 * @return {void}
 */
async function generateOutputPdf () {
  try {
    const pdfjsLib = window.pdfjsLib
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.js'

    // Set GUI to default state
    guiReset()

    // Disable buttons/links while processing
    guiProcessing()

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

    // Store parameters from HTML form in cookies for future page visits
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

    // Search within each page and highlight the found positions
    await loadingTask.promise.then(async function (pdfJsDoc) {
      for (let pageIdx = 1; pageIdx <= pdfJsDoc.numPages; pageIdx++) {
        await searchPage(pdfJsDoc, pageIdx, pdfDoc, searchTerm, rgbValue, highlightRow)
      }
    })

    // Create PDF as blob binary object to provide to browser
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

    // Enable GUI elements, as processing is finished
    guiProcessed()
  } catch (error) {
    // Show error in the console
    console.error(error)

    // Reset all GUI elements to default state
    guiReset()

    // Show error message
    document.getElementById('log').replaceChildren()
    document.getElementById('log').appendChild(document.createTextNode('Internal failure: ' + error))
    document.getElementById('log').setAttribute('class', 'error')

    // Show error stack
    document.getElementById('logdetails').replaceChildren()
    document.getElementById('logdetails').appendChild(document.createTextNode(error.stack))
  }
}

/**
 * Initialize the page by setting HTML form parameters from cookie values and add callback function to the form
 *
 * @return {void}
 */
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
