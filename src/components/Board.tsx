import React, { useState } from 'react';

interface BoardProps {
  calledNumbers: number[];
  currentNumber: number | null;
}

export const Board: React.FC<BoardProps> = ({ calledNumbers, currentNumber }) => {
  const [sizeMode, setSizeMode] = useState<'normal' | 'large' | 'jumbo'>('large');
  const calledSet = new Set(calledNumbers);

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-slate-200 shadow-xl shadow-slate-950/20">
      {/* Board Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3.5 border-b border-slate-100 mb-3">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
            Master Board (1–90)
          </h2>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-full font-num">
            {calledNumbers.length} / 90
          </span>
        </div>

        {/* Board Zoom / Size Controls */}
        <div className="flex items-center justify-end gap-1 bg-slate-100 p-1 rounded-xl self-end sm:self-auto">
          <button
            onClick={() => setSizeMode('normal')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
              sizeMode === 'normal'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Normal
          </button>
          <button
            onClick={() => setSizeMode('large')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
              sizeMode === 'large'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Large
          </button>
          <button
            onClick={() => setSizeMode('jumbo')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
              sizeMode === 'jumbo'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Jumbo (Senior)
          </button>
        </div>
      </div>

      {/* 10-Column Responsive Grid */}
      <div className="board-grid-10">
        {Array.from({ length: 90 }, (_, i) => i + 1).map(num => {
          const isCalled = calledSet.has(num);
          const isCurrent = currentNumber === num;

          return (
            <div
              key={num}
              className={`
                flex items-center justify-center rounded-lg font-num font-extrabold select-none transition-all duration-150
                ${
                  sizeMode === 'jumbo'
                    ? 'h-9 sm:h-12 md:h-14 text-sm sm:text-lg md:text-xl'
                    : sizeMode === 'large'
                    ? 'h-8 sm:h-10 md:h-12 text-xs sm:text-base md:text-lg'
                    : 'h-7 sm:h-8 md:h-10 text-[11px] sm:text-xs md:text-sm'
                }
                ${
                  isCurrent
                    ? 'bg-amber-500 text-slate-950 font-black ring-3 sm:ring-4 ring-amber-400 ring-offset-1 sm:ring-offset-2 scale-110 z-20 shadow-lg'
                    : isCalled
                    ? 'bg-indigo-600 text-white font-black shadow-xs'
                    : 'bg-white text-slate-900 border border-slate-200/90 hover:border-slate-400 hover:bg-slate-50'
                }
              `}
              aria-label={`Number ${num}${isCurrent ? ', currently called' : isCalled ? ', called' : ', uncalled'}`}
            >
              <span>{num}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 inline-block shadow-xs" />
          <span>Called Number</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md bg-amber-500 ring-2 ring-amber-400 inline-block shadow-xs" />
          <span>Current Draw</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-md bg-white border border-slate-300 inline-block" />
          <span>Uncalled</span>
        </div>
      </div>
    </div>
  );
};
