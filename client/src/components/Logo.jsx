import React from 'react';

const Logo = ({ width = 360, height = 360, className, style }) => {
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 400 400"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={style}
        >
            <defs>
                <linearGradient id="neonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#00ECFF', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#0068FF', stopOpacity: 1 }} />
                </linearGradient>
                <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <g transform="translate(50, 0) scale(0.8)">
                <g stroke="url(#neonGradient)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#neonGlow)">
                    <path d="M 135 285 Q 125 290 115 275 L 185 75 Q 200 45 215 75 L 285 275 Q 275 290 265 285" />
                    <path d="M 130 210 Q 200 330 270 210" />
                </g>
            </g>
        </svg>
    );
};

export default Logo;
