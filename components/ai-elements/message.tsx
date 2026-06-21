"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown className={className} plugins={streamdownPlugins} {...props} />
  ),
  (previousProps, nextProps) =>
    previousProps.children === nextProps.children &&
    previousProps.isAnimating === nextProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
