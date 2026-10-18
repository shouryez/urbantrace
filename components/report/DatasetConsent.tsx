type DatasetConsentProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** F14: opt in to the open dataset. Off by default; only offered when photos are blurred (F11). */
export function DatasetConsent({ checked, onChange }: DatasetConsentProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-white/6 bg-asphalt-700 p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-marking-400"
      />
      <span>
        Allow this blurred photo in the open dataset
        <span className="block text-mist-300">
          Shared under CC BY 4.0 with its category and an approximate location (about 100 m). No device id or voice note.
        </span>
      </span>
    </label>
  );
}
