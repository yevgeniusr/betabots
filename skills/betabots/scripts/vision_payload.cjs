const fs = require('node:fs')
const path = require('node:path')

function existingImages(imagePaths = []) {
  return imagePaths.filter((file) => file && fs.existsSync(file))
}

function codexImageArgs(imagePaths = []) {
  return existingImages(imagePaths).flatMap((file) => ['-i', file])
}

function imageDataUrl(file) {
  const extension = path.extname(file).toLowerCase()
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

function openRouterUserContent(prompt, imagePaths = []) {
  const images = existingImages(imagePaths)
  if (!images.length) return prompt
  return [
    { type: 'text', text: prompt },
    ...images.map((file) => ({ type: 'image_url', image_url: { url: imageDataUrl(file) } })),
  ]
}

module.exports = {
  codexImageArgs,
  openRouterUserContent,
}
