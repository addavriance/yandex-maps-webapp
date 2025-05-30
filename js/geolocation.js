/**
 * Geolocation service
 * Handles user location detection with browser and fallback methods
 */
const GeolocationService = (() => {
    const DEFAULT_LOCATION = [55.7558, 37.6173];

    let userLocation = null;

    let permissionStatus = 'unknown';
    /**
     * Display a feedback toast message
     * @param {string} message - Message to show
     * @param {number} duration - Duration in ms
     */
    const showToast = (message, duration = 3000) => {
        const existingToast = document.querySelector('.geolocation-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'geolocation-toast';
        toast.textContent = message;

        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = 'rgba(74, 124, 89, 0.9)';
        toast.style.color = 'white';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        toast.style.zIndex = '10000';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.fontSize = '14px';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    };

    /**
     * Get user location using browser geolocation API
     * @param {boolean} showPrompt - Whether to show permission prompt message
     * @returns {Promise<Array>} - [longitude, latitude]
     */
    const getBrowserLocation = (showPrompt = true) => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                permissionStatus = 'unavailable';
                reject(new Error('Геолокация не поддерживается вашим браузером'));
                return;
            }

            const options = {
                enableHighAccuracy: true, timeout: 7000, maximumAge: 0
            };

            if (showPrompt) {
                showToast('Запрашиваем доступ к вашему местоположению...', 5000);
            }

            navigator.geolocation.getCurrentPosition((position) => {
                const location = [position.coords.longitude, position.coords.latitude];
                userLocation = location;
                permissionStatus = 'granted';

                try {
                    sessionStorage.setItem('geolocation_permitted', 'true');
                } catch (e) {
                    console.warn('Session storage not available', e);
                }

                resolve(location);
            }, (error) => {
                console.warn('Geolocation error:', error);

                if (error.code === 1) {
                    permissionStatus = 'denied';

                    try {
                        sessionStorage.setItem('geolocation_permitted', 'false');
                    } catch (e) {
                        console.warn('Session storage not available', e);
                    }

                    if (showPrompt) {
                        showToast('Для точного определения пунктов выдачи разрешите доступ к геолокации', 4000);
                    }
                } else if (error.code === 2) {
                    permissionStatus = 'unavailable';
                    if (showPrompt) {
                        showToast('Не удалось определить ваше местоположение', 3000);
                    }
                } else if (error.code === 3) {
                    permissionStatus = 'timeout';
                    if (showPrompt) {
                        showToast('Истекло время определения местоположения', 3000);
                    }
                }

                reject(error);
            }, options);
        });
    };

    /**
     * Get user location from IP-based services (as fallback)
     * @returns {Promise<Array>} - [longitude, latitude]
     */
    const getIpBasedLocation = async () => {
        try {
            const services = ['https://ipapi.co/json/', 'https://ip-api.com/json/', 'https://ipinfo.io/json'];

            for (const service of services) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);

                    const response = await fetch(service, {
                        signal: controller.signal, mode: 'cors', cache: 'no-cache'
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const data = await response.json();

                        if (service.includes('ipapi.co')) {
                            return [data.longitude, data.latitude];
                        } else if (service.includes('ip-api.com')) {
                            return [data.lon, data.lat];
                        } else if (service.includes('ipinfo.io') && data.loc) {
                            const [lat, lon] = data.loc.split(',');
                            return [parseFloat(lon), parseFloat(lat)];
                        }
                    }
                } catch (serviceError) {
                    console.warn(`Failed to get location from ${service}:`, serviceError.message);
                    continue;
                }
            }

            throw new Error('All geolocation services failed');
        } catch (error) {
            console.error('Error getting IP-based location:', error);
            return DEFAULT_LOCATION;
        }
    };

    /**
     * Get user location with fallback strategy
     * @param {boolean} forceBrowser - Whether to force browser geolocation
     * @returns {Promise<Array>} - [longitude, latitude]
     */
    const getUserLocation = async (forceBrowser = false) => {
        let previouslyPermitted = false;
        try {
            previouslyPermitted = sessionStorage.getItem('geolocation_permitted') === 'true';
        } catch (e) {
            console.warn('Session storage not available', e);
        }

        if (previouslyPermitted || forceBrowser) {
            try {
                const location = await getBrowserLocation(!previouslyPermitted);
                return location;
            } catch (error) {
                console.warn('Browser geolocation failed, falling back to IP-based:', error);
            }
        }

        try {
            const location = await getIpBasedLocation();
            userLocation = location;
            return location;
        } catch (error) {
            console.error('All geolocation methods failed, using default location:', error);
            userLocation = DEFAULT_LOCATION;
            return DEFAULT_LOCATION;
        }
    };

    /**
     * Center map on user's current location
     * @param {Object} map - Yandex Maps instance
     * @param {boolean} withAnimation - Whether to animate centering
     * @param {number} zoom - Zoom level to set
     * @returns {Promise<Array|null>} - The location centered on, or null if failed
     */
    const centerOnUserLocation = async (map, withAnimation = true, zoom = 15) => {
        if (!map) return null;

        try {
            const location = await getBrowserLocation(false);

            if (window.TelegramApp && window.TelegramApp.hapticFeedback) {
                window.TelegramApp.hapticFeedback('light');
            }

            if (withAnimation) {
                map.setCenter(location, zoom, {duration: 500});
            } else {
                map.setCenter(location, zoom);
            }

            return location;
        } catch (error) {
            console.warn('Could not center on browser location, using stored location:', error);

            if (userLocation) {
                if (withAnimation) {
                    map.setCenter(userLocation, zoom, {duration: 500});
                } else {
                    map.setCenter(userLocation, zoom);
                }
                return userLocation;
            }

            try {
                const ipLocation = await getIpBasedLocation();
                userLocation = ipLocation;

                if (withAnimation) {
                    map.setCenter(ipLocation, zoom, {duration: 500});
                } else {
                    map.setCenter(ipLocation, zoom);
                }

                return ipLocation;
            } catch (finalError) {
                console.error('Failed to center map on any location:', finalError);
                return null;
            }
        }
    };

    /**
     * Create a geolocation button for the map
     * @param {Object} map - Yandex Maps instance
     * @returns {HTMLElement} - The created button
     */
    const createGeolocationButton = (map) => {
        const button = document.createElement('button');
        button.className = 'geolocation-button';
        button.setAttribute('aria-label', 'Определить моё местоположение');

        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
            </svg>
        `;

        button.addEventListener('click', async () => {
            if (window.TelegramApp && window.TelegramApp.hapticFeedback) {
                window.TelegramApp.hapticFeedback('medium');
            }

            button.classList.add('active');

            await centerOnUserLocation(map, true, 15);

            setTimeout(() => {
                button.classList.remove('active');
            }, 300);
        });

        document.getElementById('map').appendChild(button);

        return button;
    };

    /**
     * Request permission for geolocation explicitly
     * @returns {Promise<boolean>} - Whether permission was granted
     */
    const requestPermission = async () => {
        try {
            await getBrowserLocation(true);
            return true;
        } catch (error) {
            return false;
        }
    };

    return {
        getUserLocation, centerOnUserLocation, createGeolocationButton, requestPermission, get currentLocation() {
            return userLocation;
        }, get permissionStatus() {
            return permissionStatus;
        }
    };
})();
