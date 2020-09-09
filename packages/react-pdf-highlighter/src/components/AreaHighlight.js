// @flow

import React, { Component } from "react";
import TransformWrapper from "./TransformWrapper";
import { getEmojiStyle } from '../lib/coordinates';

// $FlowFixMe
import Rnd from "react-rnd";

import "../style/AreaHighlight.css";

import type { T_ViewportHighlight, T_LTWH } from "../types";

type Props = {
  highlight: T_ViewportHighlight,
  onChange: (rect: T_LTWH) => void,
    rotate: number,
    scale:number
};

class AreaHighlight extends Component<Props> {
  render() {
    const { highlight, onChange, rotate, scale, ...otherProps } = this.props;
    const { position, comment } = highlight;

    return (
      <div>
        {comment ? (
          <div
            className="Highlight__emoji"
            style={getEmojiStyle(position.boundingRect, rotate)}
          >
            {comment.emoji}
          </div>
          ) : null
        }
        <Rnd
          className="AreaHighlight"
          disableDragging={true}
          enableResizing={{
              top: false,
              right: false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
          }}
          onDragStop={(_, data) => {
            const boundingRect = {
              ...highlight.position.boundingRect,
              top: data.y,
              left: data.x
            };

            onChange(boundingRect);
          }}
          onResizeStop={(_, direction, ref, delta, position) => {
            const boundingRect = {
              top: position.y,
              left: position.x,
              width: ref.offsetWidth,
              height: ref.offsetHeight
            };

            onChange(boundingRect);
          }}
          position={{
            x: highlight.position.boundingRect.left,
            y: highlight.position.boundingRect.top
          }}
          size={{
            width: highlight.position.boundingRect.width,
            height: highlight.position.boundingRect.height
          }}
          onClick={event => {
            event.stopPropagation();
            event.preventDefault();
          }}
          {...otherProps}
        />
      </div>
    );
  }
}

export default AreaHighlight;
