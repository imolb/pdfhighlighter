'use strict'

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
 * Computes width of character based on provided font class
 *
 * @param {string} character - Character to get widths for
 * @param {PDFJsLib.Font} font - font of the found text box
 *
 * @returns {number|null} Width of character, null if not found
 */
function widthOfChar (character, font) {
  try {
    // Defensive checks - font internals vary between PDF.js versions
    if (!font || !font.toUnicode || !font.toUnicode._map || !font.widths) return null

    for (let idxMap = 0; idxMap < font.toUnicode._map.length; idxMap++) {
      if (character === font.toUnicode._map[idxMap]) {
        return font.widths[idxMap]
      }
    }
    return null
  } catch (e) {
    // If unexpected structure, return null to trigger fallback
    return null
  }
}

/**
 * Computes width of text based on provided font class
 *
 * @param {string} text - Text to compute widths for
 * @param {PDFJsLib.Font} font - font of the found text box
 *
 * @returns {number|null} Sum of character widths, null if any char not found
 */
function widthOfString (text, font) {
  let sum = 0

  for (let idxText = 0; idxText < text.length; idxText++) {
    const width = widthOfChar(text[idxText], font)

    if (width === null) {
      return null
    }
    sum += width
  }
  return sum
}

/**
 * Computes the x position and width of the highlight box
 *
 * @param {string} searchTerm - String to search for
 * @param {boolean} searchInsensitive - Search case-insensitive
 * @param {string} textBoxStr - String of the text box where the searchTerm was found
 * @param {string} highlight - 'term' = highlight only the search term, 'box' = highlight pdf box, 'row' = highlight full page row
 * @param {PDFLIb.PDFFont} pdfFontWidth - object of the PDFLib representing a font
 * @param {number} positionX - X coordinate of found text box
 * @param {number} width - width of the found text box
 * @param {number} textHeight - height of the text
 * @param {number} pageWidth - width of the page
 * @param {PDFJsLib.Font} font - font of the found text box
 *
 * @returns {array} - Returns array with field boxWidth and boxX parameters, where highlight shall be set
 */
function computeHighlightPosition (searchTerm, searchInsensitive, textBoxStr, highlight, pdfFontWidth,
  positionX, width, textHeight, pageWidth, font) {
  let boxWidth = width
  let boxX = positionX
  const highlightPos = [] // empty array for return

  switch (highlight) {
    case 'term': {
      // use flags g and/or i to find multiple occurrences
      const flags = searchInsensitive ? 'gi' : 'g'
      const searchPattern = new RegExp(searchTerm, flags)

      let searchMatch = searchPattern.exec(textBoxStr)

      while (searchMatch) {
        const termLength = searchMatch[0].length
        const idxEnd = searchPattern.lastIndex
        const idxStart = idxEnd - termLength

        // strings text before, within and after found pattern
        const textBefore = textBoxStr.substring(0, idxStart)
        const textWithin = textBoxStr.substring(idxStart, idxEnd)
        const textAfter = textBoxStr.substring(idxEnd)

        let widthBefore = widthOfString(textBefore, font)
        let widthWithin = widthOfString(textWithin, font)
        let widthAfter = widthOfString(textAfter, font)

        // If this has failed, compute based on provided fallback font
        if (widthBefore === null || widthWithin === null || widthAfter === null) {
          widthBefore = pdfFontWidth.widthOfTextAtSize(textBefore, textHeight)
          widthWithin = pdfFontWidth.widthOfTextAtSize(textWithin, textHeight)
          widthAfter = pdfFontWidth.widthOfTextAtSize(textAfter, textHeight)
        }

        // Normalize text-box width based on actual found text box
        const denom = (widthBefore + widthWithin + widthAfter)
        const scaleFactor = denom > 0 ? (width / denom) : 1

        widthBefore *= scaleFactor
        widthWithin *= scaleFactor
        widthAfter *= scaleFactor

        boxWidth = widthWithin
        boxX = positionX + widthBefore
        highlightPos.push({ boxWidth, boxX })

        searchMatch = searchPattern.exec(textBoxStr)
      }
      break
    }
    case 'box':
      // Highlight the full text box within the search term was found
      highlightPos.push({ boxWidth: width, boxX: positionX })
      break
    case 'row':
      // Highlight the full row of the page
      highlightPos.push({ boxWidth: pageWidth, boxX: 0 })
      break
    default:
      throw new Error('Input highlightRow is not row, box or term')
  }

  return highlightPos
}

/**
 * Searches for text in PDF document page and highlights the found positions using {@link highlightOutputPdf}
 *
 * @async
 * @param {pdfjslib.PDFDocument} pdfJsDoc - object of the pdfjslib representing the PDF document to search in
 * @param {number} pageIdx - page number within the PDF document to search in (1-based)
 * @param {PDFLib.PDFDocument} pdfDoc - object of the PDFLib representing the PDF document to add highlights as rectangles
 * @param {string} searchTerm - String to search for
 * @param {boolean} searchInsensitive - Search case-insensitive
 * @param {boolean} searchRegExp - Consider the searchTerm as regular expression
 * @param {PDFLib.rgb} rgbValue - background color of the rectangle
 * @param {string} highlight - 'term' = highlight only the search term, 'box' = highlight pdf box, 'row' = highlight full page row
 * @param {PDFLIb.PDFFont} pdfFontWidth - object of the PDFLib representing a font
 * @return {void}
 */
async function searchPage (pdfJsDoc, pageIdx, pdfDoc, searchTerm, searchInsensitive, searchRegExp, rgbValue, highlight, pdfFontWidth) {
  const page = await pdfJsDoc.getPage(pageIdx)
  const content = await page.getTextContent()
  // call of getOperatorList is needed, otherwise commonObjs is empty
  // eslint-disable-next-line no-unused-vars
  const opList = await page.getOperatorList()

  // if not using regex, escaping of meta chars was done earlier in caller
  const searchPattern = new RegExp(searchTerm, searchInsensitive ? 'i' : '')

  // Use for..of so we can await inside loop and ensure all drawing finished
  for (const textItem of content.items) {
    if (!searchPattern.test(textItem.str)) continue

    // get the font details (defensive)
    let font = null
    try {
      font = await page.commonObjs.get(textItem.fontName)
    } catch (e) {
      // continue if font info is not available; fallback logic below will handle widths
      font = null
    }

    const pageObj = pdfDoc.getPage(pageIdx - 1)
    const pageHeight = pageObj.getHeight()

    const highlightPos = computeHighlightPosition(searchTerm, searchInsensitive, textItem.str, highlight,
      pdfFontWidth, textItem.transform[4], textItem.width, textItem.height, pageHeight, font)

    for (let i = 0; i < highlightPos.length; i++) {
      pdfDoc.getPage(pageIdx - 1).drawRectangle({
        x: highlightPos[i].boxX,
        y: textItem.transform[5],
        height: textItem.height,
        width: highlightPos[i].boxWidth,
        color: rgbValue,
        blendMode: window.PDFLib.BlendMode.Darken
      })
    }
  }
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
 * @param {object} inputFile - object as provided from DOM <input type="file"> element
 * @return {ArrayBuffer} - ArrayBuffer representing the file
 */
async function readUploadFile (inputFile) {
  if (!inputFile) return

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read uploaded file'))
    reader.readAsArrayBuffer(inputFile)
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
  document.cookie = cname + '=' + encodeURIComponent(cvalue) + ';' + expires + ';path=/; SameSite=Lax'
}

/**
 * Read a cookie value from the browser
 *
 * @param {string} cname - name of the cookie parameter
 * @return {string|null} - value of the cookie parameter, null if not found
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
 * GUI helpers
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

function guiProcessing () {
  document.getElementById('generate').setAttribute('disabled', 'true')
  document.getElementById('log').appendChild(document.createTextNode('processing ...'))
}

function guiProcessed () {
  document.getElementById('generate').removeAttribute('disabled')
  document.getElementById('link').setAttribute('class', 'active')
  document.getElementById('outputPdf').setAttribute('style', 'visibility:visible')
  document.getElementById('log').replaceChildren()
}

/**
 * Keep track of last ObjectURL to revoke and avoid leaking memory
 */
let lastObjectUrl = null

/**
 * Call back function of the generate button in the GUI
 * The function will perform the following steps
 * - Load the PDF document by {@link readHostedFile} or {@link readUploadFile}
 * - Search for the term and highlight the found search term by {@link searchPage}
 * - Show the result
 *
 * @return {void}
 */
async function generateOutputPdf () {
  try {
    const pdfjsLib = window.pdfjsLib
    if (!pdfjsLib) throw new Error('pdfjsLib not found on window; ensure the non-module pdf.js build is loaded and exposes window.pdfjsLib')
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.js'

    // Set GUI to default state
    guiReset()

    // Disable buttons/links while processing
    guiProcessing()

    // Read input parameters from HTML form
    const searchTerm = document.getElementById('searchTerm').value
    const searchInsensitive = document.getElementById('searchInsensitive').checked
    const searchRegExp = document.getElementById('searchRegExp').checked
    const highlight = document.querySelector('input[name="highlight"]:checked').value
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
    if (typeof searchInsensitive !== 'boolean') {
      throw new Error('searchInsensitive is not boolean')
    }
    if (typeof searchRegExp !== 'boolean') {
      throw new Error('searchRegExp is not boolean')
    }
    if (typeof highlight !== 'string') {
      throw new Error('highlight is not string')
    }

    // Store parameters from HTML form in cookies for future page visits
    setCookie('searchTerm', searchTerm, 400)
    setCookie('searchInsensitive', String(searchInsensitive), 400)
    setCookie('searchRegExp', String(searchRegExp), 400)
    setCookie('highlight', highlight, 400)
    setCookie('rgbValue', document.getElementById('color').value, 400)

    // Load and read the provided input file
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
    // The fontExtraProperties are needed to have access to the width property of the font
    const loadingTask = pdfjsLib.getDocument({ data: fileContent, fontExtraProperties: true })
    const pdfJsDoc = await loadingTask.promise

    // Create a new document for purpose of text width computations
    const pdfDocWidth = await window.PDFLib.PDFDocument.create()
    const pdfFontWidth = await pdfDocWidth.embedFont(window.PDFLib.StandardFonts.TimesRoman)

    // Search within each page and highlight the found positions
    for (let pageIdx = 1; pageIdx <= pdfJsDoc.numPages; pageIdx++) {
      await searchPage(pdfJsDoc, pageIdx, pdfDoc, searchTerm, searchInsensitive, searchRegExp, rgbValue, highlight, pdfFontWidth)
    }

    // Create PDF as blob binary object to provide to browser
    const downloadPdf = await pdfDoc.save()
    const blob = new Blob([downloadPdf], { type: 'application/pdf' })
    const objectURL = URL.createObjectURL(blob)

    // Revoke previous object URL to avoid memory leak
    if (lastObjectUrl) {
      try { URL.revokeObjectURL(lastObjectUrl) } catch (e) { /* ignore */ }
    }
    lastObjectUrl = objectURL

    // Show in download link
    const link = document.getElementById('link')
    link.replaceChildren()
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
    document.getElementById('logdetails').appendChild(document.createTextNode(error.stack || String(error)))
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
  const searchInsensitive = getCookie('searchInsensitive')
  const searchRegExp = getCookie('searchRegExp')
  const highlight = getCookie('highlight')
  const rgbValue = getCookie('rgbValue')

  if (searchTerm) {
    document.getElementById('searchTerm').value = searchTerm
  }

  if (searchInsensitive) {
    if (searchInsensitive === 'true') {
      document.getElementById('searchInsensitive').checked = true
    } else {
      document.getElementById('searchInsensitive').checked = false
    }
  }

  if (searchRegExp) {
    if (searchRegExp === 'true') {
      document.getElementById('searchRegExp').checked = true
    } else {
      document.getElementById('searchRegExp').checked = false
    }
  }

  if (highlight) {
    switch (highlight) {
      case 'term':
        document.getElementById('term').checked = true
        break
      case 'box':
        document.getElementById('box').checked = true
        break
      case 'row':
        document.getElementById('row').checked = true
        break
    }
  }

  if (rgbValue) {
    document.getElementById('color').value = rgbValue
  }

  document.getElementById('form').addEventListener('submit', generateOutputPdf)
}

window.addEventListener('load', initializePage)
