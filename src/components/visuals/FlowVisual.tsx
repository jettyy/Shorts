import React from 'react';
import { BASE, type Accent } from '../../theme';
import { CONTEXT_SOLID, GRID } from '../chartTheme';
import { useDraw, useReveal } from './useReveal';
import type { FlowVisual as Data } from '../../types';

type NodeProps = {
  label: string;
  note?: string;
  highlight?: boolean;
  delay: number;
  accent: Accent;
  horizontal: boolean;
};

const FlowNode: React.FC<NodeProps> = ({ label, note, highlight, delay, accent, horizontal }) => {
  const enter = useReveal(delay);
  return (
    <div
      style={{
        flex: horizontal ? 1 : undefined,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 18}px) scale(${0.96 + enter * 0.04})`,
        padding: horizontal ? '28px 22px' : '30px 34px',
        borderRadius: 24,
        border: `3px solid ${highlight ? accent.primary : GRID}`,
        background: highlight ? `${accent.soft}` : 'rgba(255,255,255,0.04)',
        textAlign: horizontal ? 'center' : 'left',
      }}
    >
      <div
        style={{
          fontSize: horizontal ? 38 : 46,
          fontWeight: 800,
          color: highlight ? accent.bright : BASE.white,
          letterSpacing: '-0.03em',
          lineHeight: 1.25,
          wordBreak: 'keep-all',
        }}
      >
        {label}
      </div>
      {note ? (
        <div
          style={{
            marginTop: 10,
            fontSize: horizontal ? 26 : 30,
            fontWeight: 600,
            color: BASE.textMuted,
            wordBreak: 'keep-all',
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
};

const Arrow: React.FC<{ delay: number; accent: Accent; horizontal: boolean }> = ({
  delay,
  accent,
  horizontal,
}) => {
  const draw = useDraw(delay, 12);
  if (horizontal) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', opacity: draw }}>
        <div style={{ width: 22 * draw, height: 4, background: CONTEXT_SOLID, borderRadius: 2 }} />
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: '10px solid transparent',
            borderBottom: '10px solid transparent',
            borderLeft: `14px solid ${accent.primary}`,
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: draw,
        margin: '4px 0',
      }}
    >
      <div style={{ width: 4, height: 34 * draw, background: CONTEXT_SOLID, borderRadius: 2 }} />
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '11px solid transparent',
          borderRight: '11px solid transparent',
          borderTop: `15px solid ${accent.primary}`,
        }}
      />
    </div>
  );
};

/**
 * 관계 도표 — 단계·흐름·인과관계를 화살표로 잇는다.
 * "A라서 → B가 되고 → 그래서 C" 같은 구조를 말이 아니라 그림으로 보여주는 용도.
 * 세로(down)가 기본이고, 항목이 짧고 3개 이하면 가로(right)가 보기 좋다.
 */
export const FlowVisual: React.FC<{ data: Data; accent: Accent }> = ({ data, accent }) => {
  const horizontal = data.direction === 'right';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        alignItems: horizontal ? 'stretch' : 'stretch',
        gap: horizontal ? 14 : 0,
      }}
    >
      {data.nodes.map((node, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Arrow delay={8 + i * 9 - 4} accent={accent} horizontal={horizontal} /> : null}
          <FlowNode
            label={node.label}
            note={node.note}
            highlight={node.highlight}
            delay={8 + i * 9}
            accent={accent}
            horizontal={horizontal}
          />
        </React.Fragment>
      ))}
    </div>
  );
};
