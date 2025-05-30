/**
 * Map functionality for the application
 */
const MapService = (() => {
    let map = null;

    const serviceConfigs = {
        'sdek': {
            query: 'Пункт выдачи СДЭК', colors: ['#00B956', '#7ED321'], icon: '🚚', name: 'СДЭК'
        }, 'yandex': {
            query: 'Пункт выдачи Яндекс Маркет', colors: ['#FFDB4D', '#FF9500'], icon: '🛒', name: 'Яндекс'
        }, 'boxberry': {
            query: 'Пункт выдачи Boxberry', colors: ['#8E44AD', '#E74C3C'], icon: '📦', name: 'Boxberry'
        }
    };

    let currentService = 'sdek';

    let searchManager = null;
    let isMapReady = false;
    let lastSearchTime = 0;
    let lastSearchBounds = null;
    let isSearching = false;
    let searchTimeout = null;

    let selectedPoint = null;
    let currentMarkers = [];
    let pendingMarkers = [];

    /**
     * Create SVG icon for delivery point marker
     * @param {string} service - Service name
     * @param {boolean} isSelected - Whether this marker is selected
     * @returns {string} - Data URL for icon
     */
    const createDeliveryPointIcon = (service, isSelected = false) => {
        const config = serviceConfigs[service];
        const color1 = isSelected ? config.colors[1] : config.colors[0];
        const color2 = isSelected ? config.colors[0] : config.colors[1];

        const svgIcon = `
            <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="pinGradient_${service}${isSelected ? '_selected' : ''}" x1="0" y1="0" x2="32" y2="42">
                        <stop stop-color="${color1}"/>
                        <stop offset="1" stop-color="${color2}"/>
                    </linearGradient>
                    <filter id="shadow_${service}${isSelected ? '_selected' : ''}" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0, 0, 0, 0.3)"/>
                    </filter>
                </defs>
                <path d="M16 42C16 42 32 26 32 16C32 7.163 24.837 0 16 0S0 7.163 0 16C0 26 16 42 16 42Z"
                      fill="url(#pinGradient_${service}${isSelected ? '_selected' : ''})"
                      filter="url(#shadow_${service}${isSelected ? '_selected' : ''})"/>
                <circle cx="16" cy="16" r="8" fill="white"/>
                <text x="16" y="21" text-anchor="middle" font-size="12" fill="${color1}">${config.icon}</text>
            </svg>
        `;

        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgIcon)));
    };

    /**
     * Initialize the map
     */
    const initMap = async () => {
        document.getElementById('loader').classList.add('active');

        try {
            const location = await GeolocationService.getUserLocation();

            map = new ymaps.Map("map", {
                center: location, zoom: 12, controls: ['zoomControl']
            });

            searchManager = ymaps.search;

            GeolocationService.createGeolocationButton(map);

            searchDeliveryPoints();

            map.events.add(['boundschange', 'actionend'], function (e) {
                if (!isMapReady) return;

                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                    searchTimeout = null;
                }

                searchTimeout = setTimeout(function () {
                    const currentBounds = map.getBounds();
                    const currentTime = Date.now();

                    if (currentTime - lastSearchTime < 500) {
                        return;
                    }

                    if (lastSearchBounds && areBoundsSimilar(lastSearchBounds, currentBounds)) {
                        return;
                    }

                    lastSearchTime = currentTime;
                    lastSearchBounds = currentBounds;

                    searchDeliveryPoints(null, true);
                }, 500);
            });

            setTimeout(() => {
                isMapReady = true;
                lastSearchBounds = map.getBounds();
                document.getElementById('map').classList.add('full-height');

                setTimeout(() => {
                    GeolocationService.centerOnUserLocation(map, true);
                }, 1000);
            }, 1000);

            document.getElementById('loader').classList.remove('active');
            setTimeout(() => {
                document.querySelector('.map-overlay').style.display = 'none';
            }, 1000);

            return map;
        } catch (error) {
            console.error('Map initialization error:', error);
            document.getElementById('loader').classList.remove('active');
            throw error;
        }
    };

    /**
     * Check if two map bounds are similar
     * @param {Array} bounds1 - First bounds
     * @param {Array} bounds2 - Second bounds
     * @param {number} threshold - Similarity threshold
     * @returns {boolean} - Whether bounds are similar
     */
    const areBoundsSimilar = (bounds1, bounds2, threshold = 0.01) => {
        if (!bounds1 || !bounds2) return false;

        return Math.abs(bounds1[0][0] - bounds2[0][0]) < threshold && Math.abs(bounds1[0][1] - bounds2[0][1]) < threshold && Math.abs(bounds1[1][0] - bounds2[1][0]) < threshold && Math.abs(bounds1[1][1] - bounds2[1][1]) < threshold;
    };

    /**
     * Search for delivery points
     * @param {string} customQuery - Custom search query
     * @param {boolean} skipAnimation - Whether to skip animations
     */
    const searchDeliveryPoints = (customQuery = null, skipAnimation = false) => {
        if (!map || !searchManager || isSearching) return;

        isSearching = true;
        lastSearchTime = Date.now();

        if (!skipAnimation && currentMarkers.length === 0) {
            document.querySelector('.map-overlay').style.display = 'flex';
            document.querySelector('.map-overlay span').textContent = 'Ищем пункты выдачи...';
        } else if (skipAnimation && currentMarkers.length > 0) {
            document.querySelector('.map-overlay').style.display = 'flex';
            document.querySelector('.map-overlay span').textContent = 'Обновляем пункты...';
            document.querySelector('.map-overlay').style.opacity = '0.7';
        }

        const query = customQuery || serviceConfigs[currentService].query;

        try {
            const searchOptions = {
                results: 20, boundedBy: map.getBounds(), strictBounds: true
            };

            searchManager(query, searchOptions).then(function (res) {
                pendingMarkers = [];

                res.geoObjects.each(function (geoObject) {
                    try {
                        const coordinates = geoObject.geometry.getCoordinates();
                        const properties = geoObject.properties.getAll();

                        const placemark = new ymaps.Placemark(coordinates, {
                            balloonContentHeader: properties.name,
                            balloonContentBody: properties.description || properties.text,
                            hintContent: properties.name,
                            iconContent: '',
                            deliveryPointData: {
                                name: properties.name,
                                address: properties.description || properties.text || properties.address,
                                coordinates: coordinates,
                                service: currentService
                            }
                        }, {
                            iconLayout: 'default#image',
                            iconImageHref: createDeliveryPointIcon(currentService, false),
                            iconImageSize: [32, 42],
                            iconImageOffset: [-16, -42]
                        });

                        placemark.events.add('click', function (e) {
                            const clickedPlacemark = e.get('target');
                            const pointData = clickedPlacemark.properties.get('deliveryPointData');

                            TelegramApp.hapticFeedback('selection');

                            currentMarkers.forEach(marker => {
                                const markerData = marker.properties.get('deliveryPointData');
                                if (markerData) {
                                    marker.options.set('iconImageHref', createDeliveryPointIcon(markerData.service, false));
                                }
                            });

                            clickedPlacemark.options.set('iconImageHref', createDeliveryPointIcon(pointData.service, true));

                            selectPoint(pointData);
                        });

                        pendingMarkers.push(placemark);
                    } catch (markerError) {
                        console.warn('Error creating marker:', markerError);
                    }
                });

                replaceMarkersSmooth();

                document.querySelector('.map-overlay').style.display = 'none';
                document.querySelector('.map-overlay').style.opacity = '1';

                if (res.geoObjects.getLength() > 0 && !customQuery && !skipAnimation && currentMarkers.length === 0) {
                    try {
                        const bounds = res.geoObjects.getBounds();
                        if (bounds && bounds[0] && bounds[1]) {
                            map.setBounds(bounds, {
                                checkZoomRange: true, zoomMargin: 40
                            });
                        }
                    } catch (e) {
                        console.log('Bounds adjustment skipped:', e.message);
                    }
                } else if (res.geoObjects.getLength() === 0) {
                    document.querySelector('.map-overlay').style.display = 'flex';
                    document.querySelector('.map-overlay span').textContent = 'Пункты не найдены, попробуйте другой район';
                    setTimeout(() => {
                        document.querySelector('.map-overlay').style.display = 'none';
                    }, 3000);
                }

                isSearching = false;
            }).catch(function (error) {
                console.error('Search error:', error);

                if (error.message && (error.message.includes('network') || error.message.includes('fetch'))) {
                    console.log('Retrying search due to network error...');
                    setTimeout(() => {
                        isSearching = false;
                        searchDeliveryPoints(customQuery, skipAnimation);
                    }, 2000);
                    return;
                }

                document.querySelector('.map-overlay').style.display = 'none';
                document.querySelector('.map-overlay').style.opacity = '1';
                isSearching = false;
            });
        } catch (error) {
            console.error('Search initialization error:', error);
            document.querySelector('.map-overlay').style.display = 'none';
            document.querySelector('.map-overlay').style.opacity = '1';
            isSearching = false;
        }
    };

    /**
     * Replace markers with animation
     */
    const replaceMarkersSmooth = () => {
        pendingMarkers.forEach(marker => {
            map.geoObjects.add(marker);
        });

        setTimeout(() => {
            clearMarkers();
            currentMarkers = [...pendingMarkers];
            pendingMarkers = [];
        }, 100);
    };

    /**
     * Clear all markers from the map
     */
    const clearMarkers = () => {
        if (map && map.geoObjects) {
            currentMarkers.forEach(marker => {
                map.geoObjects.remove(marker);
            });
            currentMarkers = [];
        }
    };

    /**
     * Select a delivery point
     * @param {Object} point - The point data
     */
    const selectPoint = (point) => {
        selectedPoint = point;

        const serviceConfig = serviceConfigs[point.service];

        document.getElementById('pointTitle').textContent = point.name;
        document.getElementById('pointAddress').textContent = point.address;

        const pointIconElement = document.querySelector('.point-icon');
        pointIconElement.textContent = serviceConfig.icon;
        pointIconElement.style.background = `linear-gradient(135deg, ${serviceConfig.colors[0]}20, ${serviceConfig.colors[1]}20)`;

        document.getElementById('map').classList.remove('full-height');

        document.getElementById('pointInfo').classList.add('active');

        map.setCenter(point.coordinates, 16, {
            duration: 500
        });

        console.log('Point selected:', point);
    };

    /**
     * Change the current delivery service
     * @param {string} service - Service identifier
     */
    const changeService = (service) => {
        if (!serviceConfigs[service]) return;

        currentService = service;

        document.getElementById('pointInfo').classList.remove('active');
        selectedPoint = null;

        document.getElementById('map').classList.add('full-height');

        lastSearchBounds = null;
        lastSearchTime = 0;

        clearMarkers();

        searchDeliveryPoints();

        TelegramApp.hapticFeedback('medium');
    };

    /**
     * Search for delivery points with custom query
     * @param {string} query - Search query
     */
    const searchWithQuery = (query) => {
        if (query.length > 2) {
            const fullQuery = `${serviceConfigs[currentService].query} ${query}`;
            searchDeliveryPoints(fullQuery);
        } else if (query.length === 0) {
            searchDeliveryPoints();
        }
    };

    return {
        initMap, changeService, searchWithQuery, get selectedPoint() {
            return selectedPoint;
        }, get currentService() {
            return currentService;
        }, get mapInstance() {
            return map;
        }
    };
})();
