import React from 'react';

const LoadingDots = () => {
  return (
    <div className="flex items-center space-x-1 p-2">
      <span className="sr-only">Loading...</span> {/* Accessibility */}
      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
    </div>
  );
};

export default LoadingDots;

// Note: Ensure Tailwind's 'animate-bounce' utility is available.
// If not, you might need to add keyframes to your globals.css:
/*
@keyframes bounce {
  0%, 100% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0.8,0,1,1);
  }
  50% {
    transform: none;
    animation-timing-function: cubic-bezier(0,0,0.2,1);
  }
}
.animate-bounce {
  animation: bounce 1s infinite;
}
*/