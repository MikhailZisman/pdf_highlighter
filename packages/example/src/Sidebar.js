// @flow

import React from "react";
import type { T_Highlight } from "react-pdf-highlighter/src/types";
type T_ManuscriptHighlight = T_Highlight;

type Props = {
  highlights: Array<T_ManuscriptHighlight>,
  resetHighlights: () => void,
    removeHighlight: (highlight: T_ManuscriptHighlight) => void
};

const updateHash = highlight => {
  document.location.hash = `highlight-${highlight.id}`;
};

function Sidebar({ highlights, resetHighlights, removeHighlight }: Props) {
  return (
    <div className="sidebar" style={{ width: "25vw" }}>
      <div className="description" style={{ padding: "1rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Ваши комментарии</h2>
        <p>
          <small>
            Для выделения области на документе нажмите и удерживайте кнопку Alt
            во время выделения
          </small>
        </p>
      </div>

      <ul className="sidebar__highlights">
        {highlights.map((highlight, index) => (
          <li
            key={index}
            className="sidebar__highlight"
            onClick={() => {
              updateHash(highlight);
            }}
          >
            <div>
              <strong>{highlight.comment.text}</strong>
              {highlight.content.text ? (
                <blockquote style={{ marginTop: "0.5rem" }}>
                  {`${highlight.content.text.slice(0, 90).trim()}…`}
                </blockquote>
              ) : null}
              {highlight.content.image ? (
                  <div>

                        <div
                         className="highlight__image"
                        style={{ marginTop: "0.5rem" }}
                        >
                            <img src={highlight.content.image} alt={"Screenshot"} />
                        </div>
                  </div>

              ) : null}
            </div>
              <div>
                  <button onClick={() => {
                      removeHighlight(highlight);
                  }}>Remove</button>
              </div>
            <div className="highlight__location">
              Страница {highlight.position.pageNumber}
            </div>
          </li>
        ))}
      </ul>
      {highlights.length > 0 ? (
        <div style={{ padding: "1rem" }}>
          <button onClick={resetHighlights}>Сбросить</button>
        </div>
      ) : null}
    </div>
  );
}

export default Sidebar;
