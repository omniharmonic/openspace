import { RadioGroup } from "radix-ui";
import type { TemplateLook } from "../../api/types";
import "./LookPicker.css";

export interface LookPickerProps {
  looks: ReadonlyArray<TemplateLook>;
  value: string;
  onValueChange: (id: string) => void;
  /** e.g. "Meadow looks" */
  label: string;
  showNames?: boolean;
}

/** Three-look switcher: each chip shows the look's background split by its accent. */
export function LookPicker({ looks, value, onValueChange, label, showNames }: LookPickerProps) {
  return (
    <RadioGroup.Root className="st-looks" value={value} onValueChange={onValueChange} aria-label={label} orientation="horizontal">
      {looks.map((l) => (
        <RadioGroup.Item key={l.id} value={l.id} className="st-looks__item" aria-label={`${l.name} look`}>
          <span
            className="st-looks__chip"
            style={{
              background: `linear-gradient(135deg, ${l.styles.colors.background} 0 55%, ${l.styles.colors.accent} 55% 100%)`,
            }}
          />
          {showNames && <span className="st-looks__name">{l.name}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
