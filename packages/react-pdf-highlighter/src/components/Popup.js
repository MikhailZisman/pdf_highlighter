// @flow

import React, { Component } from "react";

import MouseMonitor from "./MouseMonitor";

type Props = {
  onMouseOver: (content: React$Element<*>) => void,
  popupContent: React$Element<*>,
  onMouseOut: () => void,
  children: React$Element<*>,
    rotate: number,
    scale: number
};

type State = {
  mouseIn: boolean
};

class Popup extends Component<Props, State> {
  state: State = {
    mouseIn: false
  };

  render() {
    const { onMouseOver, popupContent, onMouseOut, rotate,scale } = this.props;
    const style = {position: 'absolute'};

    return (
      <div
        className="full-size"
        style={style}
        onMouseOver={() => {
          this.setState({ mouseIn: true });

          onMouseOver(
            <MouseMonitor
                rotate={rotate}
                scale={scale}
              onMoveAway={() => {
                if (this.state.mouseIn) {
                  return;
                }

                onMouseOut();
              }}
              paddingX={60}
              paddingY={30}
              children={popupContent}
            />
          );
        }}
        onMouseOut={() => {
          this.setState({ mouseIn: false });
        }}
      >
        {this.props.children}
      </div>
    );
  }
}

export default Popup;
