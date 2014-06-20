/*global angular,OpenLayers,CONFIG*/
(function () {
    var aquaticBiologyMap = angular.module('nwc.map.aquaticBiology', []);
    aquaticBiologyMap.factory('AquaticBiologyMap', ['StoredState', 'CommonState', '$state', 'BaseMap', '$log', 'util',
        function (StoredState, CommonState, $state, BaseMap, $log, util) {
            var privateMap;

            var initMap = function () {
                var mapLayers = [];
                var initialControls = [];
                
                // ///////////////////////////////////////// BIODATA SITES
                var bioDataSitesLayer = new OpenLayers.Layer.WMS(
                        "BioData Sites",
                        CONFIG.endpoint.geoserver + 'wms',
                        {
                            layers: 'BioData:SiteInfo',
                            STYLES: 'bioData',
                            transparent: true
                        },
                        BaseMap.getWorkflowLayerOptions()
                );
                bioDataSitesLayer.id = 'biodata-sites-feature-layer';
                
                // ////////////////////////////////////////////// GAGES
                var gageFeatureLayer = new OpenLayers.Layer.WMS(
                    "Gage Location",
                    CONFIG.endpoint.geoserver + 'NWC/wms',
                    {
                        LAYERS: "NWC:gagesII",
                        STYLES: 'blue_circle',
                        format: 'image/png',
                        transparent: true,
                        tiled: true
                    },
                    {
                        isBaseLayer: false,
                        displayInLayerSwitcher: false,
                        visibility: false
                    }
                );
                gageFeatureLayer.id = 'gage-feature-layer';
                mapLayers.push(gageFeatureLayer);
                mapLayers.push(bioDataSitesLayer);
                
                var wmsGetFeatureInfoHandler = function(responseObject){
//                    //reset user selections to 0
//                    StoredState.selectedAquaticBiologySites = [];
//                    
//                    //let user pick between sites in the dragged box
//                    StoredState.aquaticBiologySites = e.features;
//                    $state.go('workflow.aquaticBiology.showSelectedBioDataSites');
                    
                    if(responseObject.features && responseObject.features.length){
                        var realFeatures = responseObject.features;
                        realFeatures = realFeatures.map(util.rejectGeometry);
                        //TODO[Sibley] We write directly to CommonState all the time, why is this "rare"?
                        //Also, even if it was, it shouldn't be an exception to the rule.
                        //It should go through the same process as everything else, no matter how it's used later.
                        CommonState.ambiguousGages = realFeatures;//rare instance in which it is ok to write directly to CommonState; we don't need to enable state restoration for ambiguous clicks
//                        $state.go('workflow.streamflowStatistics.disambiguateGages');
                    }
                };
                var biodataProtocol  = new OpenLayers.Protocol.WFS({
                    version: "1.1.0",
                    url: CONFIG.endpoint.geoserver + 'wfs',
                    featureType: 'SiteInfo',
                    featureNS: 'http://cida.usgs.gov/BioData',
                    srsName: 'EPSG:900913'
                });
                var gageProtocol = OpenLayers.Protocol.WFS.fromWMSLayer(gageFeatureLayer, {
                    url : CONFIG.endpoint.geoserver + "wfs",
                    srsName : "EPSG:3857",
                    propertyNames: ["STAID","STANAME","CLASS","AGGECOREGI",
                        "DRAIN_SQKM","HUC02","LAT_GAGE","LNG_GAGE","STATE",
                        "HCDN_2009","ACTIVE09","FLYRS1900","FLYRS1950","FLYRS1990"]
                });
                //TODO[Sibley] make this a subclass of Protocol and override all correctly.
                //Also, don't forget about abort, because abort doesn't seem to be part of 
                //the Protocol class? it's just in the subclasses?
                var joinedProtocol = new (function(protocols) {
                    this.protocols = protocols;
                    this.read = function(request) {
                        console.log("read joined called");
                        this.protocols.each(function(el) {
                            console.log("Calling read");
                            el.read(request);
                        });
                    };
                    this.abort = function(abortParam) {
                        console.log("abort joined called");
                        this.protocols.each(function(el) {
                            console.log("Calling abort");
                            el.abort(abortParam);
                        });
                    };
                })([gageProtocol, biodataProtocol]);
                var gageGetFeatureControl = new OpenLayers.Control.GetFeature({
                    id: 'nwc-streamflow-gage-identify-control',
                    title: 'gage-identify-control',
                    protocol: joinedProtocol,
                    maxFeatures: null,
                    box: true
                });
                gageGetFeatureControl.events.register("featuresselected", {}, wmsGetFeatureInfoHandler);
                initialControls.push(gageGetFeatureControl);
                
                var hucLayerOptions = BaseMap.getWorkflowLayerOptions();
                hucLayerOptions.visibility = false;
                var hucLayer = new OpenLayers.Layer.WMS("National WBD Snapshot",
                    CONFIG.endpoint.geoserver + 'gwc/service/wms',
                    {
                        layers: 'NWC:huc12_SE_Basins_v2',
                        transparent: true,
                        styles: ['polygon']
                    },
                    hucLayerOptions
                );
                hucLayer.id = 'hucs';
                
                mapLayers.push(hucLayer);
                
                // ////////////////////////////////////////////// FLOWLINES
                var flowlinesData = new OpenLayers.Layer.FlowlinesData(
                        "Flowline WMS (Data)",
                        CONFIG.endpoint.geoserver + 'gwc/service/wms'
                );
                flowlinesData.id = 'nhd-flowlines-data-layer';

                var flowlineRaster = new OpenLayers.Layer.FlowlinesRaster({
                    name: "NHD Flowlines",
                    dataLayer: flowlinesData,
                    streamOrderClipValue: 0,
                    displayInLayerSwitcher: false
                });
                flowlineRaster.id = 'nhd-flowlines-raster-layer';
                
                mapLayers.push(flowlinesData);
                mapLayers.push(flowlineRaster);
                
//                var waterCensusToolbar = new OpenLayers.Control.WaterCensusToolbar({}, new OpenLayers.Control.BioSitesSelectionTool());
//                initialControls.push(waterCensusToolbar);
                initialControls.push(new OpenLayers.Control.Navigation({
                    id: 'nwc-navigation'
                }));
                initialControls.push(new OpenLayers.Control.ZoomBox({
                    id: 'nwc-zoom'
                }));
//                var bioDataGetFeatureControl = new OpenLayers.Control.GetFeature({
//                    id: 'nwc-biodata-sites',
//                    protocol: new OpenLayers.Protocol.WFS({
//                        version: "1.1.0",
//                        url: CONFIG.endpoint.geoserver + 'wfs',
//                        featureType: 'SiteInfo',
//                        featureNS: 'http://cida.usgs.gov/BioData',
//                        srsName: 'EPSG:900913'
//                    }),
//                    box: true
//                });
//                initialControls.push(bioDataGetFeatureControl);
//                bioDataGetFeatureControl.events.register('featuresselected', {}, function (e) {
//                    
//                    //reset user selections to 0
//                    StoredState.selectedAquaticBiologySites = [];
//                    
//                    //let user pick between sites in the dragged box
//                    StoredState.aquaticBiologySites = e.features;
//                    $state.go('workflow.aquaticBiology.showSelectedBioDataSites');
//                });
                
                var map = BaseMap.new({
                    layers: mapLayers,
                    controls: initialControls
                });
                
                map.events.register(
                        'zoomend',
                        map,
                        function () {
                            var zoom = map.zoom;
                            $log.info('Current map zoom: ' + zoom);
                            flowlineRaster.updateFromClipValue(flowlineRaster.getClipValueForZoom(zoom));
                        },
                        true
                );
                
                flowlineRaster.setStreamOrderClipValues(map.getNumZoomLevels());
                flowlineRaster.updateFromClipValue(flowlineRaster.getClipValueForZoom(map.zoom));
                
                /**
                 * 
                 * @param {String} interest one of 'observed' or 'modeled'
                 */
                map.switchToInterest = function(interest){
                    if('observed' === interest){
//                        hucsGetFeatureInfoControl.deactivate();
                        hucLayer.setVisibility(false);
                        StoredState.streamFlowStatHucFeature = undefined;

                        gageFeatureLayer.setVisibility(true);
//                        gageGetFeatureControl.activate();
                    }
                    else if('modeled' === interest){
                        gageFeatureLayer.setVisibility(false);
//                        gageGetFeatureControl.deactivate();
                        StoredState.gage = undefined;

                        hucLayer.setVisibility(true);
//                        hucsGetFeatureInfoControl.activate();
                    } else {
                        hucLayer.setVisibility(false);
                        gageFeatureLayer.setVisibility(false);
                    }
                };
                
                //stash it in a closure var
                privateMap = map;
                return privateMap;
            };
            var getMap = function () {
                if (!privateMap) {
                    initMap();
                }
                return privateMap;
            };
            return {
                initMap: initMap,
                getMap: getMap
            };
        }
    ]);

}());