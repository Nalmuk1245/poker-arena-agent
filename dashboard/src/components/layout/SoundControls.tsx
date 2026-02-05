import React, { useState } from 'react';
import { useSoundManager } from '../../hooks/useSoundManager';

export const SoundControls: React.FC = () => {
  const { volume, setVolume, muted, setMuted, playSound } = useSoundManager();
  const [showSlider, setShowSlider] = useState(false);

  const handleToggleMute = () => {
    setMuted(!muted);
    if (muted) {
      // Play a test sound when unmuting
      playSound('turnAlert');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    playSound('chipBet');
  };

  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={() => !muted && setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      {/* Speaker Icon */}
      <button
        onClick={handleToggleMute}
        className="p-2 rounded-lg transition-all duration-200 hover:bg-white/5"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`transition-all duration-200 ${
            muted
              ? 'opacity-40 text-gray-500'
              : 'text-[rgba(131,110,249,1)] opacity-100'
          }`}
        >
          {/* Speaker base */}
          <path
            d="M11 5L6 9H2v6h4l5 4V5z"
            fill="currentColor"
            opacity="0.8"
          />
          {/* Sound waves */}
          {!muted && (
            <>
              <path
                d="M15.54 8.46a5 5 0 010 7.07"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
              />
              <path
                d="M18.07 5.93a9 9 0 010 12.73"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.4"
              />
            </>
          )}
          {/* Mute X */}
          {muted && (
            <path
              d="M16 9l6 6m0-6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {/* Volume Slider */}
      {showSlider && !muted && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-[rgba(20,20,30,0.95)] backdrop-blur-sm border border-[rgba(131,110,249,0.3)] rounded-lg p-3 shadow-xl z-50">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">
              VOL
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, rgba(131,110,249,0.8) 0%, rgba(131,110,249,0.8) ${volume * 100}%, rgba(75,75,90,1) ${volume * 100}%, rgba(75,75,90,1) 100%)`,
              }}
            />
            <span className="text-[10px] text-[rgba(131,110,249,1)] font-mono font-bold min-w-[2ch] text-right">
              {Math.round(volume * 100)}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(131,110,249,1);
          cursor: pointer;
          border: 2px solid rgba(20,20,30,1);
          box-shadow: 0 0 8px rgba(131,110,249,0.5);
          transition: all 0.15s ease;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          background: rgba(151,130,255,1);
          box-shadow: 0 0 12px rgba(131,110,249,0.8);
          transform: scale(1.1);
        }

        .slider-thumb::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(131,110,249,1);
          cursor: pointer;
          border: 2px solid rgba(20,20,30,1);
          box-shadow: 0 0 8px rgba(131,110,249,0.5);
          transition: all 0.15s ease;
        }

        .slider-thumb::-moz-range-thumb:hover {
          background: rgba(151,130,255,1);
          box-shadow: 0 0 12px rgba(131,110,249,0.8);
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};
