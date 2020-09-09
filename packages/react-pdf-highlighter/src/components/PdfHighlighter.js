// @flow
import React, { PureComponent } from "react";
import ReactDom from "react-dom";
import Pointable from "react-pointable";
import _ from "lodash/fp";
import {
  PDFViewer,
  PDFLinkService,
  getGlobalEventBus
} from "pdfjs-dist/web/pdf_viewer";

import "pdfjs-dist/web/pdf_viewer.css";
import "../style/pdf_viewer.css";

import "../style/PdfHighlighter.css";

import getBoundingRect from "../lib/get-bounding-rect";
import getClientRects from "../lib/get-client-rects";
import getAreaAsPng from "../lib/get-area-as-png";

import {
  getPageFromRange,
  getPageFromElement,
  findOrCreateContainerLayer
} from "../lib/pdfjs-dom";

import TipContainer from "./TipContainer";
import MouseSelection from "./MouseSelection";

import { scaledToViewport, viewportToScaled } from "../lib/coordinates";

import type {
  T_Position,
  T_ScaledPosition,
  T_Highlight,
  T_Scaled,
  T_LTWH,
  T_PDFJS_Viewer,
  T_PDFJS_Document,
  T_PDFJS_LinkService
} from "../types";

type T_ViewportHighlight<T_HT> = { position: T_Position } & T_HT;

type State<T_HT> = {
  ghostHighlight: ?{
    position: T_ScaledPosition
  },
  isCollapsed: boolean,
  range: ?Range,
  tip: ?{
    highlight: T_ViewportHighlight<T_HT>,
    callback: (highlight: T_ViewportHighlight<T_HT>) => React$Element<*>
  },
  isAreaSelectionInProgress: boolean,
  scrolledToHighlightId: string,
  rotate: number,
  scale: number
};

type Props<T_HT> = {
  highlightTransform: (
    highlight: T_ViewportHighlight<T_HT>,
    index: number,
    setTip: (
      highlight: T_ViewportHighlight<T_HT>,
      callback: (highlight: T_ViewportHighlight<T_HT>) => React$Element<*>
    ) => void,
    hideTip: () => void,
    viewportToScaled: (rect: T_LTWH) => T_Scaled,
    screenshot: (position: T_LTWH) => string,
    isScrolledTo: boolean
  ) => React$Element<*>,
  highlights: Array<T_HT>,
  onScrollChange: () => void,
  scrollRef: (scrollTo: (highlight: T_Highlight) => void) => void,
  pdfDocument: T_PDFJS_Document,
  onSelectionFinished: (
    position: T_ScaledPosition,
    content: { text?: string, image?: string },
    hideTipAndSelection: () => void,
    transformSelection: () => void
  ) => ?React$Element<*>,
  enableAreaSelection: (event: MouseEvent) => boolean,
  rotate: number,
  scale: number
};

const EMPTY_ID = "empty-id";

class PdfHighlighter<T_HT: T_Highlight> extends PureComponent<
  Props<T_HT>,
  State<T_HT>
> {
  state: State<T_HT> = {
    ghostHighlight: null,
    isCollapsed: true,
    range: null,
    scrolledToHighlightId: EMPTY_ID,
    isAreaSelectionInProgress: false,
    tip: null,
    rotate: 0,
    scale: 1
  };

  viewer: T_PDFJS_Viewer;
  linkService: T_PDFJS_LinkService;

  containerNode: ?HTMLDivElement = null;

  debouncedAfterSelection: () => void;

  componentDidUpdate(prevProps: Props<T_HT>) {
    if (
      prevProps.highlights !== this.props.highlights ||
      prevProps.rotate !== this.props.rotate ||
      prevProps.scale !== this.props.scale
    ) {
      this.renderHighlights(this.props);
    }
  }

  componentDidMount() {
    const { pdfDocument } = this.props;

    this.debouncedAfterSelection = _.debounce(500, this.afterSelection);
    this.linkService = new PDFLinkService();

    this.viewer = new PDFViewer({
      container: this.containerNode,
      enhanceTextSelection: true,
      removePageBorders: true,
      linkService: this.linkService,
      scale: 1
    });

    this.viewer.setDocument(pdfDocument);

    this.linkService.setDocument(pdfDocument);
    this.linkService.setViewer(this.viewer);

    // debug
    window.PdfViewer = this;

    document.addEventListener("selectionchange", this.onSelectionChange);
    document.addEventListener("keydown", this.handleKeyDown);

    document.addEventListener("pagesinit", () => {
      this.onDocumentReady();
    });

    document.addEventListener("textlayerrendered", this.onTextLayerRendered);
  }

  componentWillUnmount() {
    document.removeEventListener("selectionchange", this.onSelectionChange);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("textlayerrendered", this.onTextLayerRendered);
  }

  findOrCreateHighlightLayer(page: number) {
    const textLayer = this.viewer.getPageView(page - 1).textLayer;

    if (!textLayer) {
      return null;
    }

    return findOrCreateContainerLayer(
      textLayer.textLayerDiv,
      "PdfHighlighter__highlight-layer"
    );
  }

  groupHighlightsByPage(
    highlights: Array<T_HT>
  ): { [pageNumber: string]: Array<T_HT> } {
    const { ghostHighlight } = this.state;
    return [...highlights, ghostHighlight]
      .filter(Boolean)
      .reduce((res, highlight) => {
        const { pageNumber } = highlight.position;

        res[pageNumber] = res[pageNumber] || [];
        res[pageNumber].push(highlight);

        return res;
      }, {});
  }

  showTip(highlight: T_ViewportHighlight<T_HT>, content: React$Element<*>) {
    const {
      isCollapsed,
      ghostHighlight,
      isAreaSelectionInProgress
    } = this.state;

    const highlightInProgress = !isCollapsed || ghostHighlight;

    if (highlightInProgress || isAreaSelectionInProgress) {
      return;
    }

    this.renderTipAtPosition(highlight.position, content);
  }

  scaledPositionToViewport({
    pageNumber,
    boundingRect,
    rects,
    usePdfCoordinates
  }: T_ScaledPosition): T_Position {
    const viewport = this.viewer.getPageView(pageNumber - 1).viewport;
    const currentScale = this.viewer.currentScaleValue;
    const pagesRotation = this.viewer.pagesRotation;

    return {
      boundingRect: scaledToViewport(
        boundingRect,
        viewport,
        +currentScale,
        pagesRotation,
        usePdfCoordinates
      ),
      rects: (rects || []).map(rect =>
        scaledToViewport(
          rect,
          viewport,
          +currentScale,
          pagesRotation,
          usePdfCoordinates
        )
      ),
      pageNumber
    };
  }

  viewportPositionToScaled({
    pageNumber,
    boundingRect,
    rects
  }: T_Position): T_ScaledPosition {
    const viewport = this.viewer.getPageView(pageNumber - 1).viewport;
    const currentScaleValue = +this.viewer.currentScaleValue;
    const pagesRotation = this.viewer.pagesRotation;
    return {
      boundingRect: viewportToScaled(
        boundingRect,
        viewport,
        currentScaleValue,
        pagesRotation
      ),
      rects: (rects || []).map(rect =>
        viewportToScaled(rect, viewport, currentScaleValue, pagesRotation)
      ),
      pageNumber
    };
  }

  scale(scale, relativeRotation) {
    this.viewer.currentScaleValue = scale;
    this.viewer.pagesRotation = relativeRotation;
  }

  screenshot(position: T_LTWH, pageNumber: number) {
    const canvas = this.viewer.getPageView(pageNumber - 1).canvas;
    return getAreaAsPng(canvas, position);
  }

  renderHighlights(nextProps?: Props<T_HT>) {
    const { highlightTransform, highlights, rotate, scale, onSelectionFinished } =
      nextProps || this.props;

    this.scale(scale, rotate);

    const { pdfDocument } = this.props;

    const { tip, scrolledToHighlightId } = this.state;

    const highlightsByPage = this.groupHighlightsByPage(highlights);

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const highlightLayer = this.findOrCreateHighlightLayer(pageNumber);

      if (highlightLayer) {
        ReactDom.render(
          <div className="full-size">
            {(highlightsByPage[String(pageNumber)] || []).map(
              (highlight, index) => {
                const { position, tipPosition, content, id, ...rest } = highlight;

                const viewportHighlight = {
                  position: this.scaledPositionToViewport(position),
                  content,
                  id,
                  ...rest
                };

                if (tip && tip.highlight.id === String(highlight.id)) {
                  this.showTip(tip.highlight, tip.callback(viewportHighlight));
                }

                const isScrolledTo = Boolean(
                  scrolledToHighlightId === highlight.id
                );

                // if ghost highlight
                if (!id) {
                  this.renderTipAtPosition(
                    viewportHighlight.position,
                    onSelectionFinished(
                      position,
                      content,
                      () => this.hideTipAndSelection(),
                      () => {}
                    )
                  );
                }

                return highlightTransform(
                  viewportHighlight,
                  index,
                  (highlight, callback) => {
                    this.setState({
                      tip: { highlight, callback }
                    });

                    this.showTip(highlight, callback(highlight));
                  },
                  this.hideTipAndSelection,
                  rect => {
                    const viewport = this.viewer.getPageView(pageNumber - 1)
                      .viewport;
                    const currentScaleValue = +this.viewer.currentScaleValue;
                    const pagesRotation = this.viewer.pagesRotation;
                    return viewportToScaled(
                      rect,
                      viewport,
                      currentScaleValue,
                      pagesRotation
                    );
                  },
                  boundingRect => this.screenshot(boundingRect, pageNumber),
                  isScrolledTo
                );
              }
            )}
          </div>,
          highlightLayer
        );
      }
    }
  }

  hideTipAndSelection = () => {
    const tipNode = findOrCreateContainerLayer(
      this.viewer.viewer,
      "PdfHighlighter__tip-layer"
    );

    ReactDom.unmountComponentAtNode(tipNode);

    this.setState({ ghostHighlight: null, tip: null }, () =>
      this.renderHighlights()
    );
  };

  renderTipAtPosition(position: T_ScaledPosition | T_Position, inner: ?React$Element<*>) {
    const { boundingRect, pageNumber } = position;

    const page = {
      node: this.viewer.getPageView(pageNumber - 1).div
    };

    const pageBoundingRect = page.node.getBoundingClientRect();

    const tipNode = findOrCreateContainerLayer(
      this.viewer.viewer,
      "PdfHighlighter__tip-layer"
    );

    const isDefined = val => val !== null && val !== undefined;
    const left = isDefined(boundingRect.left) ? boundingRect.left : boundingRect.x1;
    const top = isDefined(boundingRect.top) ? boundingRect.top : boundingRect.y1;

    ReactDom.render(
      <TipContainer
        scrollTop={this.viewer.container.scrollTop}
        pageBoundingRect={pageBoundingRect}
        style={{
          left: page.node.offsetLeft + left + boundingRect.width / 2,
          top: top + page.node.offsetTop,
          bottom: top + page.node.offsetTop + boundingRect.height
        }}
        children={inner}
      />,
      tipNode
    );
  }

  onTextLayerRendered = () => {
    this.renderHighlights();
  };

  scrollTo = (highlight: T_Highlight) => {
    const { pageNumber, boundingRect, usePdfCoordinates } = highlight.position;

    this.viewer.container.removeEventListener("scroll", this.onScroll);

    const pageViewport = this.viewer.getPageView(pageNumber - 1).viewport;

    // console.log("pageview:" + JSON.stringify(this.viewer.getPageView(pageNumber - 1).pageViewport.height))
    const scrollMargin = 10;

    let currentScaleValue = +this.viewer.currentScaleValue;
    let pagesRotation = this.viewer.pagesRotation;
    let x = 0;
    let y =
      scaledToViewport(
        boundingRect,
        pageViewport,
        currentScaleValue,
        pagesRotation,
        usePdfCoordinates
      ).top - scrollMargin;
    let convertToPdfPoint = pageViewport.convertToPdfPoint(x, y);
    if (pagesRotation === undefined || pagesRotation === 0) {
      convertToPdfPoint = pageViewport.convertToPdfPoint(x, y);
    } else if (pagesRotation === 90 || pagesRotation === -90) {
      convertToPdfPoint = pageViewport.convertToPdfPoint(y, x);
    } else if (pagesRotation === -180 || pagesRotation === 180) {
      // debugger;
      // let height = this.viewer.getPageView(pageNumber - 1).pageViewport.height;
      // console.log("height:" + height)
      convertToPdfPoint = pageViewport.convertToPdfPoint(x, y);
    }

    let offset = 0;
    // Deprecated
    switch (pagesRotation) {
      case 0:
        offset = [
          boundingRect.x1,
          boundingRect.height - boundingRect.y1 - scrollMargin
        ];
        break;
      case 90:
        offset = [
          boundingRect.x1 - 150, //150 - offset page with header height
          boundingRect.height - boundingRect.y1
        ];

        break;
      case -180:
        offset = [
          boundingRect.width - boundingRect.x2,
          boundingRect.height - boundingRect.y2 - boundingRect.height / 2
        ];
        break;
      case 180:
        offset = [
          boundingRect.width - boundingRect.x2,
          boundingRect.height - boundingRect.y2 - boundingRect.height / 2
        ];
        break;
      case -90:
        offset = [
          boundingRect.x2, //150 - offset page with header height
          boundingRect.height - boundingRect.y1
        ];
        break;
    }

    this.viewer.scrollPageIntoView({
      pageNumber,
      destArray: [
        null,
        { name: "XYZ" },
        ...convertToPdfPoint,
        currentScaleValue
      ],
      allowNegativeOffset: false
    });

    this.setState(
      {
        scrolledToHighlightId: highlight.id
      },
      () => this.renderHighlights()
    );

    // wait for scrolling to finish
    setTimeout(() => {
      this.viewer.container.addEventListener("scroll", this.onScroll);
    }, 100);
  };

  onDocumentReady = () => {
    const { scrollRef } = this.props;

    // this.viewer.currentScaleValue = "auto";

    scrollRef(this.scrollTo);
  };

  onSelectionChange = () => {
    const selection: Selection = window.getSelection();

    if (selection.isCollapsed) {
      this.setState({ isCollapsed: true });
      return;
    }

    const range = selection.getRangeAt(0);

    if (!range) {
      return;
    }

    this.setState({
      isCollapsed: false,
      range
    });

    this.debouncedAfterSelection();
  };

  onScroll = () => {
    const { onScrollChange } = this.props;

    onScrollChange();

    this.setState(
      {
        scrolledToHighlightId: EMPTY_ID
      },
      () => this.renderHighlights()
    );

    this.viewer.container.removeEventListener("scroll", this.onScroll);
  };

  onMouseDown = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.closest(".PdfHighlighter__tip-container")) {
      return;
    }

    this.hideTipAndSelection();
  };

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      this.hideTipAndSelection();
    }
  };

  afterSelection = () => {
    const { onSelectionFinished } = this.props;

    const { isCollapsed, range } = this.state;

    if (!range || isCollapsed) {
      return;
    }

    const page = getPageFromRange(range);

    if (!page) {
      return;
    }

    const rects = getClientRects(range, page.node);

    if (rects.length === 0) {
      return;
    }

    const boundingRect = getBoundingRect(rects);

    const viewportPosition = { boundingRect, rects, pageNumber: page.number };

    const content = {
      text: range.toString()
    };
    const scaledPosition = this.viewportPositionToScaled(viewportPosition);
    this.setState(
      {
        ghostHighlight: {position: scaledPosition, content}
      },
      () => this.renderHighlights()
    );
  };

  toggleTextSelection(flag: boolean) {
    this.viewer.viewer.classList.toggle(
      "PdfHighlighter--disable-selection",
      flag
    );
  }

  render() {
    const {
      onSelectionFinished,
      enableAreaSelection,
      scale,
      rotate
    } = this.props;

    return (
      <Pointable onPointerDown={this.onMouseDown}>
        <div
          ref={node => (this.containerNode = node)}
          className="PdfHighlighter"
          onContextMenu={e => e.preventDefault()}
        >
          <div className="pdfViewer" />
          {typeof enableAreaSelection === "function" ? (
            <MouseSelection
              onDragStart={() => this.toggleTextSelection(true)}
              onDragEnd={() => this.toggleTextSelection(false)}
              onChange={isVisible =>
                this.setState({ isAreaSelectionInProgress: isVisible })
              }
              shouldStart={event =>
                enableAreaSelection(event) &&
                event.target instanceof HTMLElement &&
                Boolean(event.target.closest(".page"))
              }
              onSelection={(startTarget, boundingRect, resetSelection) => {
                const page = getPageFromElement(startTarget);

                if (!page) {
                  return;
                }

                const pageBoundingRect = {
                  ...boundingRect,
                  top: boundingRect.top - page.node.offsetTop,
                  left: boundingRect.left - page.node.offsetLeft
                };

                const viewportPosition = {
                  boundingRect: pageBoundingRect,
                  rects: [],
                  pageNumber: page.number
                };

                const scaledPosition = this.viewportPositionToScaled(
                  viewportPosition
                );
                const image = this.screenshot(
                  viewportPosition.boundingRect,
                  page.number
                );

                this.setState(
                  {
                    ghostHighlight: {position: scaledPosition, content: { image }}
                  },
                  () => {
                    resetSelection();
                    this.renderHighlights();
                  }
                );
              }}
            />
          ) : null}
        </div>
      </Pointable>
    );
  }
}

export default PdfHighlighter;
