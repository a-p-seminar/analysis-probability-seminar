import React from 'react';
import { MetadataIcon } from './MetadataIcon.mjs';

export function TimeSelect({ label, value = '', onChange }) {
  function openPicker(event) {
    try { event.currentTarget.showPicker?.(); }
    catch { /* Browsers without popup support retain their native time control. */ }
  }
  return <label className="time-picker"><span className="field-label"><MetadataIcon type="clock"/>{label}</span>
    <input type="time" aria-label={label} step="60" value={value} onClick={openPicker} onChange={event => onChange(event.target.value)}/>
  </label>;
}
