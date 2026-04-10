#import "@preview/wrap-it:0.1.1": wrap-content

#let booker-wrap-start(insert, body, width: 38%, gutter: 0.75em) = {
  wrap-content(
    box(insert, width: width),
    body,
    align: top + left,
    columns: (width, 1fr),
    column-gutter: gutter,
  )
}

#let booker-wrap-end(insert, body, width: 38%, gutter: 0.75em) = {
  wrap-content(
    box(insert, width: width),
    body,
    align: top + right,
    columns: (1fr, width),
    column-gutter: gutter,
  )
}
