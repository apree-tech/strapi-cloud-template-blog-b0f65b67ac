import { useState, useEffect } from 'react';

/**
 * Helper to get cookie value by name
 */
const getCookieValue = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

/**
 * Hook to get the current admin user
 * Fetches user data from the /admin/users/me endpoint
 */
export const useCurrentUser = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Get the JWT token - Strapi 5 stores it in localStorage (JSON) or cookie
        let token = null;

        // Try localStorage first (when "Remember me" is checked)
        const storedToken = localStorage.getItem('jwtToken');
        if (storedToken) {
          try {
            token = JSON.parse(storedToken);
          } catch {
            token = storedToken;
          }
        }

        // If not in localStorage, try cookie
        if (!token) {
          token = getCookieValue('jwtToken');
        }

        if (!token) {
          console.log('[Collaborative] No auth token found in localStorage or cookie');
          setLoading(false);
          return;
        }

        console.log('[Collaborative] Fetching current user with token...');
        const response = await fetch('/admin/users/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.data);
          console.log('[Collaborative] Current user:', data.data);
        } else {
          console.error('[Collaborative] Failed to fetch user:', response.status);
        }
      } catch (error) {
        console.error('[Collaborative] Error fetching user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return { user, loading };
};

export default useCurrentUser;
