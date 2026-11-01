import { Plus, X } from "lucide-react";

// The letters are only for display. The server stores the position (0 = a).
export const LETTERS = "abcdef";
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

// A list of option inputs with a radio button for the correct one.
export default function OptionRows({
  options,
  correct,
  onChangeOption,
  onPickCorrect,
  onAdd,
  onRemove,
}) {
  return (
    <div className="field">
      <span className="label">Options (tick the correct one)</span>
      {options.map((option, index) => (
        <div className="option-row" key={index}>
          <input
            type="radio"
            name="correct"
            checked={correct === index}
            onChange={() => onPickCorrect(index)}
            aria-label={`Option ${LETTERS[index]} is correct`}
          />
          <span className="letter">{LETTERS[index]}</span>
          <input
            className="input"
            value={option}
            onChange={(e) => onChangeOption(index, e.target.value)}
            placeholder={`Option ${LETTERS[index]}`}
            maxLength={200}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => onRemove(index)}
            disabled={options.length <= MIN_OPTIONS}
            aria-label={`Remove option ${LETTERS[index]}`}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {options.length < MAX_OPTIONS && (
        <button type="button" className="btn-text" onClick={onAdd}>
          <Plus size={16} />
          Add option
        </button>
      )}
    </div>
  );
}
