/**
 * Geolocation service
 * Handles user location detection with improved error handling
 */
const GeolocationService = (() => {
    const DEFAULT_LOCATION = [55.7558, 37.6173];

    let userLocation = null;

    let permissionStatus = 'unknown';
    const IP_GEOLOCATION_TIMEOUT = 5000;

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
                enableHighAccuracy: true,
                timeout: 5000, maximumAge: 0
            };

            let ipLocationPromise = getIpBasedLocation();

            if (showPrompt) {
                showToast('Определяем ваше местоположение...', 3000);
            }

            const timeoutId = setTimeout(async () => {
                try {
                    console.log('Browser geolocation timeout, using IP fallback');
                    const ipLocation = await ipLocationPromise;
                    resolve(ipLocation);
                } catch (err) {
                    console.error('Both browser and IP geolocation failed', err);
                    reject(err);
                }
            }, 3000);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    clearTimeout(timeoutId);

                    const location = [position.coords.longitude, position.coords.latitude];
                    userLocation = location;
                    permissionStatus = 'granted';

                    resolve(location);
                },
                (error) => {
                    console.warn('Geolocation error:', error);

                    clearTimeout(timeoutId);

                    if (error.code === 1) {
                        permissionStatus = 'denied';
                    } else if (error.code === 2) {
                        permissionStatus = 'unavailable';
                    } else if (error.code === 3) {
                        permissionStatus = 'timeout';
                    }

                    ipLocationPromise
                        .then(location => {
                            resolve(location);
                        })
                        .catch(ipError => {
                            console.error('IP geolocation also failed after browser geolocation error', ipError);
                            reject(error);
                        });
                },
                options
            );
        });
    };

    /**
     * Get user location from ipinfo.io service
     * @returns {Promise<Array>} - [longitude, latitude]
     */
    const getIpBasedLocation = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), IP_GEOLOCATION_TIMEOUT);

            const response = await fetch('https://ipinfo.io/json', {
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                console.log('IP Geolocation data:', data);

                if (data.loc) {
                    const [lat, lon] = data.loc.split(',');
                    return [parseFloat(lat), parseFloat(lon)];
                }
            }

            throw new Error('IP geolocation response missing location data');
        } catch (error) {
            console.error('Error getting IP-based location:', error);
            return DEFAULT_LOCATION;
        }
    };

    /**
     * Get user location with fallback strategy
     * Always tries IP-based location first for reliability
     * @returns {Promise<Array>} - [longitude, latitude]
     */
    const getUserLocation = async () => {
        try {
            const ipLocation = await getIpBasedLocation();
            userLocation = ipLocation;

            try {
                const browserLocation = await Promise.race([
                    getBrowserLocation(false),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Browser geolocation timeout')), 3000)
                    )
                ]);

                userLocation = browserLocation;
                return browserLocation;
            } catch (browserError) {
                console.log('Using IP location as browser geolocation failed or timed out', browserError);
                return ipLocation;
            }
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
            let location = await getIpBasedLocation();
            userLocation = location;

            if (window.TelegramApp && window.TelegramApp.hapticFeedback) {
                window.TelegramApp.hapticFeedback('light');
            }

            if (withAnimation) {
                map.setCenter(location, zoom, {duration: 500});
            } else {
                map.setCenter(location, zoom);
            }

            getBrowserLocation(false).then(browserLocation => {
                const distance = calculateDistance(location, browserLocation);
                if (distance > 0.5) {
                    userLocation = browserLocation;
                    map.setCenter(browserLocation, zoom, {duration: 500});
                }
            }).catch(error => {
                console.log('Browser location failed after centering on IP location', error);
            });

            return location;
        } catch (error) {
            console.error('Failed to center map on any location:', error);

            if (withAnimation) {
                map.setCenter(DEFAULT_LOCATION, zoom, {duration: 500});
            } else {
                map.setCenter(DEFAULT_LOCATION, zoom);
            }

            return DEFAULT_LOCATION;
        }
    };

    /**
     * Calculate approximate distance between two points in km
     * @param {Array} point1 - [lon1, lat1]
     * @param {Array} point2 - [lon2, lat2]
     * @returns {number} - Distance in kilometers
     */
    const calculateDistance = (point1, point2) => {
        const toRad = value => value * Math.PI / 180;

        const R = 6371;
        const dLat = toRad(point2[1] - point1[1]);
        const dLon = toRad(point2[0] - point1[0]);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(point1[1])) * Math.cos(toRad(point2[1])) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
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

    return {
        getUserLocation,
        centerOnUserLocation,
        createGeolocationButton,
        get currentLocation() {
            return userLocation;
        },
        get permissionStatus() {
            return permissionStatus;
        }
    };
})();
