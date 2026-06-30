import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Component that listens to the router location hash and scrolls the corresponding
 * element into view when found. Uses a small fallback timeout to handle components
 * still mounting during routing transitions.
 */
export function ScrollToAnchor(): null {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const element = document.getElementById(id);
      if (element) {
        // Smooth scroll to the target element
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // If the element isn't in the DOM yet (due to React render timing/mounting),
        // try again after a brief timeout.
        const timer = setTimeout(() => {
          const delayedElement = document.getElementById(id);
          if (delayedElement) {
            delayedElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [hash, pathname]);

  return null;
}

export default ScrollToAnchor;
