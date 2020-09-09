// @flow

import React, { Component } from "react";
import ReactDOM from 'react-dom';

type Props = {
  rotate: number;
  scale: number;
}

type State = {
  parent: HTMLElement
}

class TransformWrapper extends Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {};
  }

  componentDidMount(): * {
    this.setState({
      parent: this.getTransformableParent()
    });
  }

  getTransformableParent(): HTMLElement {
    let parent = ReactDOM.findDOMNode(this);
    while ((parent = parent.parentElement) && parent.className !== 'textLayer') {}
    return parent;
  }

  clampRotation(rotation: number) {
    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;
    return rotation;
  }

  getContainerTransform(parent: HTMLElement, rotate: number, scale: number): string {
    if (!parent) {
      return 'none';
    }
    const rect = parent.getBoundingClientRect();
    const [x, y] = this.getOffsets(rotate, rect);
    return `rotate(${rotate}deg) scale(${scale}) translate(${x}px, ${y}px)`;
  }

  getOffsets(rotate: number, rect: ClientRect): [number, number] {
    switch (rotate) {
      case 90: case -90:
            return [0, -rect.width];
      case 180: case -180:
            return [-rect.width, -rect.height];
      default:
        return [0, 0];
    }
  }

  render() {
    const { rotate, scale } = this.props;
    const parent: HTMLElement = this.state.parent;

    const outerDivStyle = {
      transform: this.getContainerTransform(parent, rotate, scale),
      transformOrigin: '0% 0%'
    }

    return (<div className="full-size" style={outerDivStyle}>{this.props.children}</div>);
  }
}

export default TransformWrapper;
