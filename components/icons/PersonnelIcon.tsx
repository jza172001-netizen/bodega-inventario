import React from 'react';

export const PersonnelIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        {/* dome */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5Q12 2 19 10.5" />
        {/* brim line */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18" />
        {/* base band */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5h14v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2z" />
    </svg>
);