/*global angular,OpenLayers,CONFIG*/
(function () {
    var streamflowMap = angular.module('nwc.map.streamflow', ['nwc.util', 'nwc.conversion']);
    streamflowMap.factory('StreamflowMap', ['StoredState', 'CommonState', '$state', 'BaseMap', '$log', 'util', 'Convert',
        function (StoredState, CommonState, $state, BaseMap, $log, util, Convert) {
            var map;
            
            var initMap = function () {
                var mapLayers = [];
                var initialControls = [];

                var flowlineRaster;
                
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
                
                initialControls.push(new OpenLayers.Control.Navigation({
                    id: 'nwc-navigation'
                }));
                initialControls.push(new OpenLayers.Control.ZoomBox({
                    id: 'nwc-zoom'
                }));
                
                var wmsGetFeatureInfoHandler = function(responseObject){
                    if(responseObject.features && responseObject.features.length){
                        //OpenLayers stores the actual features in a weird spot of the response
                        if(responseObject.features[0].features && responseObject.features[0].features.length){
                            var realFeatures = responseObject.features[0].features;
                            realFeatures = realFeatures.map(util.rejectGeometry);
                            CommonState.ambiguousGages = realFeatures;//rare instance in which it is ok to write directly to CommonState; we don't need to enable state restoration for ambiguous clicks
                            $state.go('workflow.streamflowStatistics.disambiguateGages');
                        }
                    }
                };
                
                var wmsGetFeatureInfoControl = new OpenLayers.Control.WMSGetFeatureInfo({
                    id: 'nwc-streamflow-gage-identify-control',
                    title: 'gage-identify-control',
                    hover: false,
                    autoActivate: false,
                    layers: [
                        gageFeatureLayer
                    ],
                    queryVisible: true,
                    output: 'object',
                    drillDown: true,
                    infoFormat: 'application/vnd.ogc.gml',
                    vendorParams: {
                        radius: 5
                    }
                });

                wmsGetFeatureInfoControl.events.register("getfeatureinfo", {}, wmsGetFeatureInfoHandler);
                initialControls.push(wmsGetFeatureInfoControl);
                
                var wfsProtocol = OpenLayers.Protocol.WFS.fromWMSLayer(hucLayer, {
                    url : CONFIG.endpoint.geoserver + "wfs",
                    srsName : "EPSG:3857",
                    //TODO! I really don't like this. I'd like to only ask for what I need at this moment, but
                    //this is given to the next step of the workflow, so it relys on this...
                    propertyNames : ["OBJECTID","HUC12","mi2","DRAIN_SQKM",
                        "SLOPE_PCT","RFACT","SILTAVE","ROCKDEPAVE","PPTAVG_BAS",
                        "PLANTNLCD0","HUC4","Outlet_X","Outlet_Y","Centroid_X",
                        "Centroid_Y","Shape_Leng","Shape_Area","site_no","HU_12_NAME"]
                });
                var hucsGetFeatureControl = new OpenLayers.Control.GetFeature({
                    id: 'nwc-streamflow-huc-identify-control',
                    protocol : wfsProtocol,
                    autoActivate: false,
                    maxFeatures : null
                });
                var minStatDate = Date.create('1980/10/01').utc();
                var maxStatDate = Date.create('2010/09/30').utc();
                var featureHandler = function(eventName, responseObject) {
                    console.log("Hit " + eventName);
                    var actualFeatures = responseObject.features;
                    var hucCount = actualFeatures.length;
                    if (0 === hucCount) {
                        //nothing (In fact, we won't even get here if there are no features to select)
                    } else {
                        var sortedFeature = actualFeatures.min(function(el){
                            var result = Infinity;
                            
                            var mi2 = parseFloat(el.data.mi2);
                            if (mi2) {
                                result = mi2;
                            }
                            
                            return result;
                        });
                        StoredState.streamFlowStatHucFeature = sortedFeature;
                        CommonState.streamFlowStatMinDate = minStatDate;
                        CommonState.streamFlowStatMaxDate = maxStatDate;
                        StoredState.siteStatisticsParameters = {};
                        var statisticsParameters = StoredState.siteStatisticsParameters;
                        statisticsParameters.startDate = Date.create(minStatDate).utc();
                        statisticsParameters.endDate = Date.create(maxStatDate).utc();
                        var km2 = Convert.acresToSquareKilometers(
                                Convert.squareMilesToAcres(StoredState.streamFlowStatHucFeature.data.mi2));
                        if (km2 > 2000) {
                            alert("Hydrologic model results are not valid for watersheds this large (" + km2.round(0) + " km^2), please choose a smaller watershed.");
                        } else {
                            $state.go('workflow.streamflowStatistics.setSiteStatisticsParameters');
                        }
                    }
                };
                
                var eventToHandle = "featuresselected"
                hucsGetFeatureControl.events.register(eventToHandle, {}, featureHandler.fill(eventToHandle));
                initialControls.push(hucsGetFeatureControl);
                
                var legend = new OpenLayers.Control.Attribution();
                initialControls.push(legend);
                
                map = BaseMap.new({
                    layers: mapLayers,
                    controls: initialControls
                });

                var mapZoomForExtent = map.getZoomForExtent(map.extent);
                map.setCenter(map.extent.getCenterLonLat(), mapZoomForExtent);

                var streamOrderClipValues = [
                    7, // 0
                    7,
                    7,
                    6,
                    6,
                    6, // 5
                    5,
                    5,
                    5,
                    4,
                    4, // 10
                    4,
                    3,
                    3,
                    3,
                    2, // 15
                    2,
                    2,
                    1,
                    1,
                    1 // 20
                ];
                var streamOrderClipValue = 0;
                var flowlineAboveClipPixel;
                var createFlowlineColor = function(r,g,b,a) {
                    flowlineAboveClipPixel = (a & 0xff) << 24 | (b & 0xff) << 16 | (g & 0xff) << 8 | (r & 0xff);
                };
                createFlowlineColor(100,100,255,255);
                var addFlowLinesLayer = function(map) {
                    streamOrderClipValue = streamOrderClipValues[map.zoom];

                    map.events.register(
                        'zoomend',
                        map,
                        function() {
                            streamOrderClipValue = streamOrderClipValues[map.zoom];
                        },
                        true
                    );

                    // define per-pixel operation
                    var flowlineClipOperation = OpenLayers.Raster.Operation.create(function(pixel) {
                        if (pixel >> 24 === 0) { return 0; }
                        var value = pixel & 0x00ffffff;
                        if (value >= streamOrderClipValue && value < 0x00ffffff) {
                            return flowlineAboveClipPixel;
                        } else {
                            return 0;
                        }
                    });

                    var flowlineLayer = "NHDPlusFlowlines:PlusFlowlineVAA_NHDPlus-StreamOrder";
                    var options = {
                        opacity: 0,
                        displayInLayerSwitcher: false,
                        tileOptions: {
                            crossOriginKeyword: 'anonymous'
                        }
                    };
                    var flowlinesWMSData = new OpenLayers.Layer.FlowlinesData(
                        "Flowline WMS (Data)",
                        CONFIG.endpoint.geoserver + 'gwc/service/wms'
                    );
                    flowlinesWMSData.id = 'nhd-flowlines-data-layer';
                    map.addLayer(flowlinesWMSData);

                    // source canvas (writes WMS tiles to canvas for reading)
                    var flowlineComposite = OpenLayers.Raster.Composite.fromLayer(flowlinesWMSData, {int32: true});

                    // filter source data through per-pixel operation
                    var flowlineClipOperationData = flowlineClipOperation(flowlineComposite);

                    var flowLayerName = "NHD Flowlines"
                    flowlineRaster = new OpenLayers.Layer.Raster({
                        name: flowLayerName,
                        data: flowlineClipOperationData,
                        isBaseLayer: false
                    });
                    flowlineRaster.visibility = true;

                    // define layer that writes data to a new canvas
                    flowlineRaster.setData(flowlineClipOperationData);

                    // add the special raster layer to the map viewport
                    map.addLayer(flowlineRaster);

                    // this prevent the rendering of the lines even if the layer is not checked
                    map.events.register('changelayer', null, function(evt){
                        if (evt.property === "visibility"
                         && evt.layer.name === flowLayerName) {
                            setLayerVisibility(flowlinesWMSData, evt.layer.visibility);
                        }
                    });
                };
                addFlowLinesLayer(map);
                
                /**
                 * 
                 * @param {String} interest one of 'observed' or 'modeled'
                 */
                map.switchToInterest = function(interest){
                    if('observed' === interest){
                        hucsGetFeatureControl.deactivate();
                        hucLayer.setVisibility(false);
                        StoredState.streamFlowStatHucFeature = undefined;
                        
                        gageFeatureLayer.setVisibility(true);
                        flowlineRaster.setVisibility(true);
                        wmsGetFeatureInfoControl.activate();
                    }
                    else if('modeled' === interest){
                        
                        gageFeatureLayer.setVisibility(false);
                        flowlineRaster.setVisibility(true);
                        wmsGetFeatureInfoControl.deactivate();
                        StoredState.gage = undefined;

                        hucLayer.setVisibility(true);
                        hucsGetFeatureControl.activate();

                    }
                    else{
                        throw Error('unknown interest supplied: ' + interest);
                    }
                };
                map.switchGageStyle = function(styleName) {
                    gageFeatureLayer.mergeNewParams({STYLES: styleName});
                };
                map.switchGageLegend = function(legendUrl) {
                    gageFeatureLayer.addOptions({attribution: '<img src="' + legendUrl + '"/>'});
                    // easiest way to redraw legend :(
                    gageFeatureLayer.mergeNewParams();
                };
                return map;
            };
            var getMap = function () {
                if (!map) {
                    initMap();
                }
                return map;
            };
            
            
            
            return {
                initMap: initMap,
                getMap: getMap
            };
        }
    ]);

}());