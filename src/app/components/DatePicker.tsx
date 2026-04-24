import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function formatDateLocal(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (isoDate: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Callback that returns true if the given ISO date should be disabled */
  isDateDisabled?: (isoDate: string) => boolean;
}

export function DatePicker({ value, onChange, placeholder = 'Datum wählen', disabled = false, isDateDisabled }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? isoToDate(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Schließen bei Klick außerhalb
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Wenn sich value ändert, viewDate anpassen
  useEffect(() => {
    if (value) {
      setViewDate(isoToDate(value));
    }
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // Erster Tag der Woche (0=So, 1=Mo, ...) → wir wollen Mo=0
  let startOffset = firstDayOfMonth.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days: Array<{ day: number; current: boolean; iso: string; disabled: boolean }> = [];

  // Vorheriger Monat (graue Tage)
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const iso = dateToIso(new Date(year, month - 1, d));
    days.push({ day: d, current: false, iso, disabled: true });
  }

  // Aktueller Monat
  const todayIso = dateToIso(new Date());
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = dateToIso(new Date(year, month, d));
    const disabledByProp = isDateDisabled ? isDateDisabled(iso) : false;
    days.push({ day: d, current: true, iso, disabled: disabledByProp });
  }

  // Nächster Monat (graue Tage) — auffüllen auf volle Wochen
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const iso = dateToIso(new Date(year, month + 1, d));
    days.push({ day: d, current: false, iso, disabled: true });
  }

  const goPrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const goNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goPrevYear = () => setViewDate(new Date(year - 1, month, 1));
  const goNextYear = () => setViewDate(new Date(year + 1, month, 1));

  const handleSelect = (iso: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onChange(iso);
    setIsOpen(false);
  };

  const jumpToToday = () => {
    setViewDate(new Date());
  };

  const displayValue = value ? formatDateLocal(value) : '';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-[140px] transition-colors ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed text-gray-400'
            : 'bg-white hover:border-teal-400 text-gray-900'
        }`}
        disabled={disabled}
      >
        <Calendar className={`w-4 h-4 ${disabled ? 'text-gray-400' : 'text-teal-600'}`} />
        <span className={displayValue ? 'text-gray-900' : 'text-gray-400'}>
          {displayValue || placeholder}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 z-50 w-[320px] p-4">
          {/* Monats-/Jahres-Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={goPrevYear} className="p-1 hover:bg-gray-100 rounded-lg transition-colors" title="Vorheriges Jahr">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
              <ChevronLeft className="w-4 h-4 text-gray-500 -mt-3" />
            </button>
            <button onClick={goPrevMonth} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-base font-semibold text-gray-800 min-w-[140px] text-center">
              {MONATE[month]} {year}
            </div>
            <button onClick={goNextMonth} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={goNextYear} className="p-1 hover:bg-gray-100 rounded-lg transition-colors" title="Nächstes Jahr">
              <ChevronRight className="w-4 h-4 text-gray-500" />
              <ChevronRight className="w-4 h-4 text-gray-500 -mt-3" />
            </button>
          </div>

          {/* Wochentage */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WOCHENTAGE.map(wd => (
              <div key={wd} className="text-center text-xs font-medium text-gray-400 py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Tage */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const isToday = day.iso === todayIso;
              const isSelected = day.iso === value;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(day.iso, day.disabled)}
                  disabled={day.disabled}
                  className={`
                    h-9 w-9 rounded-lg text-sm flex items-center justify-center transition-colors
                    ${!day.current ? 'text-gray-300' : ''}
                    ${day.disabled && day.current ? 'text-gray-300 cursor-not-allowed' : ''}
                    ${!day.disabled && day.current ? 'text-gray-700 hover:bg-teal-50' : ''}
                    ${isSelected ? 'bg-teal-600 text-white hover:bg-teal-700 font-semibold' : ''}
                    ${isToday && !isSelected && !day.disabled ? 'ring-1 ring-teal-400 font-semibold text-teal-700' : ''}
                  `}
                >
                  {day.day}
                </button>
              );
            })}
          </div>

          {/* Heute-Button */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-center">
            <button
              onClick={jumpToToday}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium px-3 py-1 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Heute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
