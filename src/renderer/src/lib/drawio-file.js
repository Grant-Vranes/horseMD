// Drawio (.drawio) file helpers: the minimal valid document used when creating
// a new diagram, and the validity rule for loaded files. .drawio content is
// XML (`<mxfile>` wrapping one or more `<diagram>` pages, optionally
// deflate+base64 compressed). We never parse the XML semantics — XML passes
// through to the drawio editor verbatim; this module only decides
// "blank canvas vs corrupt file" and provides the empty template.
export const EMPTY_DRAWIO_XML =
  '<mxfile host="horsemd" version="31.4.5">' +
  '<diagram id="page-1" name="Page-1">' +
  '<mxGraphModel dx="1422" dy="798" grid="1" gridSize="10" guides="1" tooltips="1" ' +
  'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
  'math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /></root>' +
  '</mxGraphModel></diagram></mxfile>'

// A loaded file is treated as drawio XML when it carries one of the known
// root markers. Fully-compressed bodies (deflate+base64, no '<' at all) are
// rejected on purpose: drawio re-serializes them on first save, and the
// corrupt fallback (blank canvas + one-shot note) is the safer default for
// anything we cannot recognize.
export function isValidDrawioXml(text) {
  if (typeof text !== 'string') return false
  return /<mxfile[\s>]/i.test(text) || /<mxGraphModel[\s>]/i.test(text)
}
