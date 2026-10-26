import { Slider as RSlider } from "radix-ui";
import { cx } from "./cx";
import "./Slider.css";

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  className,
  "aria-label": ariaLabel,
  id,
  disabled,
}: SliderProps) {
  return (
    <RSlider.Root
      className={cx("st-slider", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([v]) => v !== undefined && onValueChange(v)}
      onValueCommit={([v]) => v !== undefined && onValueCommit?.(v)}
    >
      <RSlider.Track className="st-slider__track">
        <RSlider.Range className="st-slider__range" />
      </RSlider.Track>
      <RSlider.Thumb className="st-slider__thumb" aria-label={ariaLabel} id={id} />
    </RSlider.Root>
  );
}
