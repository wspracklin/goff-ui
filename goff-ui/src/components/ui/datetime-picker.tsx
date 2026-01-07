'use client';

import * as React from 'react';
import DatePicker from 'react-datepicker';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

import 'react-datepicker/dist/react-datepicker.css';

interface DateTimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick a date and time',
  className,
  disabled = false,
}: DateTimePickerProps) {
  const date = React.useMemo(() => {
    if (!value) return null;
    try {
      const parsed = new Date(value);
      if (isValid(parsed)) return parsed;
      const localParsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
      if (isValid(localParsed)) return localParsed;
    } catch {
      // Ignore parse errors
    }
    return null;
  }, [value]);

  const handleChange = (selectedDate: Date | null) => {
    if (selectedDate) {
      onChange?.(format(selectedDate, "yyyy-MM-dd'T'HH:mm"));
    }
  };

  return (
    <div className={cn('datetime-picker-wrapper', className)}>
      <DatePicker
        selected={date}
        onChange={handleChange}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        dateFormat="MMM d, yyyy h:mm aa"
        placeholderText={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm',
          'placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400',
          'dark:focus:ring-zinc-600'
        )}
        calendarClassName="datetime-picker-calendar"
        showIcon
        icon={<CalendarIcon className="h-4 w-4 text-zinc-500" />}
        wrapperClassName="w-full"
      />
      <style jsx global>{`
        .datetime-picker-wrapper {
          width: 100%;
        }
        .react-datepicker-wrapper {
          width: 100%;
        }
        .react-datepicker__input-container {
          width: 100%;
          display: flex;
          align-items: center;
        }
        .react-datepicker__input-container input {
          padding-left: 2.25rem !important;
        }
        .react-datepicker__input-container .react-datepicker__calendar-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          padding: 0;
        }
        .react-datepicker {
          font-family: inherit;
          border: 1px solid #e4e4e7;
          border-radius: 0.5rem;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        .react-datepicker__header {
          background-color: #f4f4f5;
          border-bottom: 1px solid #e4e4e7;
          border-top-left-radius: 0.5rem;
          border-top-right-radius: 0.5rem;
          padding-top: 0.5rem;
        }
        .react-datepicker__current-month {
          font-weight: 600;
          font-size: 0.875rem;
          color: #18181b;
        }
        .react-datepicker__day-name {
          color: #71717a;
          font-weight: 500;
          font-size: 0.75rem;
        }
        .react-datepicker__day {
          color: #18181b;
          border-radius: 0.375rem;
          transition: background-color 0.15s;
        }
        .react-datepicker__day:hover {
          background-color: #f4f4f5;
        }
        .react-datepicker__day--selected,
        .react-datepicker__day--keyboard-selected {
          background-color: #18181b !important;
          color: white !important;
        }
        .react-datepicker__day--today {
          font-weight: 600;
          background-color: #e4e4e7;
        }
        .react-datepicker__day--outside-month {
          color: #a1a1aa;
        }
        .react-datepicker__time-container {
          border-left: 1px solid #e4e4e7;
        }
        .react-datepicker__time-container .react-datepicker__time {
          background: white;
        }
        .react-datepicker__time-container .react-datepicker__time-box {
          width: 100%;
        }
        .react-datepicker__time-list-item {
          height: auto !important;
          padding: 0.5rem !important;
          font-size: 0.875rem;
        }
        .react-datepicker__time-list-item:hover {
          background-color: #f4f4f5 !important;
        }
        .react-datepicker__time-list-item--selected {
          background-color: #18181b !important;
          color: white !important;
        }
        .react-datepicker__navigation {
          top: 0.625rem;
        }
        .react-datepicker__navigation-icon::before {
          border-color: #71717a;
        }
        .react-datepicker__navigation:hover *::before {
          border-color: #18181b;
        }
        .react-datepicker__triangle {
          display: none;
        }

        /* Dark mode styles */
        .dark .react-datepicker {
          background-color: #18181b;
          border-color: #3f3f46;
        }
        .dark .react-datepicker__header {
          background-color: #27272a;
          border-bottom-color: #3f3f46;
        }
        .dark .react-datepicker__current-month {
          color: #fafafa;
        }
        .dark .react-datepicker__day-name {
          color: #a1a1aa;
        }
        .dark .react-datepicker__day {
          color: #fafafa;
        }
        .dark .react-datepicker__day:hover {
          background-color: #3f3f46;
        }
        .dark .react-datepicker__day--today {
          background-color: #3f3f46;
        }
        .dark .react-datepicker__day--outside-month {
          color: #71717a;
        }
        .dark .react-datepicker__time-container {
          border-left-color: #3f3f46;
        }
        .dark .react-datepicker__time-container .react-datepicker__time {
          background: #18181b;
        }
        .dark .react-datepicker__time-list-item {
          color: #fafafa;
        }
        .dark .react-datepicker__time-list-item:hover {
          background-color: #3f3f46 !important;
        }
        .dark .react-datepicker__navigation-icon::before {
          border-color: #a1a1aa;
        }
        .dark .react-datepicker__navigation:hover *::before {
          border-color: #fafafa;
        }
      `}</style>
    </div>
  );
}

// Compact version for smaller spaces
export function DateTimePickerCompact({
  value,
  onChange,
  placeholder = 'Select date/time',
  className,
  disabled = false,
}: DateTimePickerProps) {
  const date = React.useMemo(() => {
    if (!value) return null;
    try {
      const parsed = new Date(value);
      if (isValid(parsed)) return parsed;
      const localParsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
      if (isValid(localParsed)) return localParsed;
    } catch {
      // Ignore
    }
    return null;
  }, [value]);

  const handleChange = (selectedDate: Date | null) => {
    if (selectedDate) {
      onChange?.(format(selectedDate, "yyyy-MM-dd'T'HH:mm"));
    }
  };

  return (
    <div className={cn('datetime-picker-compact-wrapper', className)}>
      <DatePicker
        selected={date}
        onChange={handleChange}
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        dateFormat="MMM d, h:mm aa"
        placeholderText={placeholder}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs',
          'placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400',
          'dark:focus:ring-zinc-600'
        )}
        calendarClassName="datetime-picker-calendar-compact"
        showIcon
        icon={<CalendarIcon className="h-3 w-3 text-zinc-500" />}
        wrapperClassName="w-full"
        popperClassName="datetime-picker-popper-compact"
      />
      <style jsx global>{`
        .datetime-picker-compact-wrapper {
          width: 100%;
        }
        .datetime-picker-compact-wrapper .react-datepicker-wrapper {
          width: 100%;
        }
        .datetime-picker-compact-wrapper .react-datepicker__input-container {
          width: 100%;
          display: flex;
          align-items: center;
        }
        .datetime-picker-compact-wrapper .react-datepicker__input-container input {
          padding-left: 1.75rem !important;
        }
        .datetime-picker-compact-wrapper .react-datepicker__calendar-icon {
          position: absolute;
          left: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          padding: 0;
        }
        .datetime-picker-popper-compact .react-datepicker {
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}
