/*global angular SCE */
(function () {
    var streamflowStatistics = angular.module('nwc.controllers.streamflowStatistics', ['nwc.streamStats', 'nwc.wps', 'nwc.dictionary', 'nwc.streamStats.dictionary', 'nwc.waterYear', 'nwc.plotter', 'nwc.conversion']);
    streamflowStatistics.controller('StreamflowStatistics', [ '$scope', 'StoredState', '$sce',
        NWC.ControllerHelpers.WorkflowController(
            {
                name: "Streamflow Statistics Calculator",
                description: "Access streamflow statistics for National Water Information\n\
                    System gages and modeled daily flow in some regions. Select a gage or\n\
                    watershed, provide a time period for which statistics are required, and\n\
                    choose statistics to receive. Software to calculate these statistics is\n\
                    also available as an open-source package on GitHub:\n\
                    <a href=\"https://github.com/USGS-R/EflowStats\" target=\"_blank\">\n\
                    https://github.com/USGS-R/EflowStats <i class=\"fa fa-external-link\"></i></a>.",
                disclaimer: "Preliminary Subject to Change"
            },
            function($scope, StoredState, $sce) {
                $scope.description = $sce.trustAsHtml($scope.description);
                $scope.observedSelected = function() {
                    return StoredState.interestType === 'observed';
                };
            }
        )
    ]);
    streamflowStatistics.controller('SelectSite', ['$scope', '$http', 'StoredState', 'CommonState', 'StoredState',
        'StreamflowMap', 'styleDescriptions', 'interestTypeDescriptions', 'MapControlDescriptions',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Select Gage or HUC',
                description: 'Select a gage or a HUC to retrieve its statistics.'
            },
            function ($scope, $http, StoredState, CommonState, StoredState, StreamflowMap, styleDescriptions,
            interestTypeDescriptions, MapControlDescriptions) {
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;
                $scope.styleDescriptions = styleDescriptions;
                $scope.interestTypeDescriptions = interestTypeDescriptions;
                $scope.MapControlDescriptions = MapControlDescriptions;
                
                var mapId = 'siteSelectMap';
                var map = StreamflowMap.getMap();
                var gagesLayerFromGetCaps = undefined;
                var legendOptions = "&legend_options=forceLabels:on;fontName:Times New Roman;fontAntiAliasing:true;fontColor:0x000033;fontSize:8px;bgColor:0xFFFFEE;dpi:100";
                map.render(mapId);
                StoredState.mapExtent = StoredState.mapExtent || map.getMaxExtent();
                map.zoomToExtent(StoredState.mapExtent, true);
                map.events.register(
                    'moveend',
                    map,
                    function() {
                        StoredState.mapExtent = map.getExtent();
                    },
                    false
                );
        
                var format = new OpenLayers.Format.WMSCapabilities({
                    version: "1.1.1"
                });
                
                var getCapsSuccess = function(response) {
                    CommonState.wmsCapabilities = format.read(response.data);
                    var gagesName = "NWC:gagesII";
                    gagesLayerFromGetCaps = CommonState.wmsCapabilities.capability.layers.find(function(layer){
                        return layer['name'] === gagesName;
                    });
                    map.switchGageLegend(gagesLayerFromGetCaps.styles[0].legend.href + legendOptions);
                };
                
                var getCapsFailure = function(response) {
                    var url = response.config.url;
                    var message = 'An error occurred while retrieving get capabilities document from:\n' +
                            url + '\n' +
                            'See browser logs for details';
                    alert(message);
                    $log.error('Error while accessing: ' + url + '\n' + response.data);
                };
                
                $http.get(CONFIG.endpoint.geoserver + 'wms',
                    {
                        params: {
                            SERVICE: "WMS",
                            VERSION: "1.1.1",
                            REQUEST: "GetCapabilities"
                        }
                    }
                ).then(getCapsSuccess, getCapsFailure);

                $scope.$watch('StoredState.interestType', function(newInterest, oldInterest) {
                    if(newInterest !== oldInterest){
                        StreamflowMap.getMap().switchToInterest(newInterest);
                        CommonState.interestTypeDescription = interestTypeDescriptions[newInterest];
                    }
                });
                $scope.$watch('StoredState.gageStyle', function(newStyle, oldStyle) {
                    if(newStyle !== oldStyle) {
                        var style = gagesLayerFromGetCaps.styles.find(function(style) {
                            return style.name === styleDescriptions[newStyle].styleName;
                        });
                        if (style === undefined) {
                            style = {
                                name: "blue_circle",
                                legend: {
                                    href: ""
                                }
                            };
                        }
                        StreamflowMap.getMap().switchGageStyle(style.name);
                        // switch this to style.abstract?
                        CommonState.gageStyleDescription = styleDescriptions[newStyle].description;

                        StreamflowMap.getMap().switchGageLegend(style.legend.href + legendOptions);
                    }
                });
                $scope.$watch('CommonState.activatedMapControl', function(newControl, oldControl) {
                    var controlId;
                    if (newControl === 'zoom') {
                        controlId = 'nwc-zoom';
                    } else if (newControl === 'pan') {
                        controlId = 'nwc-navigation';
                    } else {
                        controlId = (StoredState.interestType === 'observed') ? 'nwc-streamflow-gage-identify-control' : 'nwc-streamflow-huc-identify-control';
                    }
                    if (newControl !== oldControl) {
                        var controls = StreamflowMap.getMap().getControlsBy('id', /nwc-.*/);
                        angular.forEach(controls, function(control) {
                            control.deactivate();
                        });
                    }
                    var activeControl = StreamflowMap.getMap().getControlsBy('id', controlId)[0];
                    activeControl.activate();
                    CommonState.mapControlDescription = MapControlDescriptions[newControl].description;
                    CommonState.mapControlCursor = MapControlDescriptions[newControl].cursor;
                });

                StoredState.interestType = StoredState.interestType || 'observed';
                StoredState.gageStyle = StoredState.gageStyle || 'blue_circle';
                CommonState.activatedMapControl = 'select';
                StreamflowMap.getMap().switchToInterest(StoredState.interestType);
                CommonState.interestTypeDescription = interestTypeDescriptions[StoredState.interestType];
                CommonState.mapControlDescription = MapControlDescriptions.select.description;
                CommonState.mapControlCursor = MapControlDescriptions.select.cursor;
                CommonState.showStreamflowPlot = CommonState.showStreamflowPlot || false;
            }
        )
    ]);
    streamflowStatistics.controller('DisambiguateGages', ['$scope', 'StoredState', 'CommonState', 'StoredState', '$state',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Disambiguate Stream Gages',
                description: 'Your selection landed near multiple gages. Select one of the following gages to proceed.'
            },
            function ($scope, StoredState, CommonState, StoredState, $state) {
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;
                $scope.gages = CommonState.ambiguousGages;
                $scope.affirmGage = function(gage){
                    StoredState.gage = gage;
                    StoredState.siteStatisticsParameters = {};
                };
            }
        )
    ]);
    
    streamflowStatistics.controller('SetSiteStatisticsParameters', ['$scope', 'StoredState', 'CommonState', 'StoredState', '$state', 'StreamStats', 'WaterYearUtil',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Select Streamflow Statistics Parameters',
                description: 'Select a subset of the time series for which you would like to calculate various statistics.'
            },
            function ($scope, StoredState, CommonState, StoredState, $state, StreamStats, WaterYearUtil) {
                StoredState.streamflowStatsParamsReady = false;
                CommonState.showStreamflowPlot = CommonState.showStreamflowPlot || false;
                
                var selectionInfo = {};
                if (CommonState.streamFlowStatMinDate && CommonState.streamFlowStatMaxDate) {
                    if(StoredState.gage){
                        selectionInfo.gageId = StoredState.gage.data.STAID;
                        selectionInfo.gageName = StoredState.gage.data.STANAME;
                        selectionInfo.drainageArea = StoredState.gage.data.DRAIN_SQKM;
                        selectionInfo.minDate = CommonState.streamFlowStatMinDate;
                        selectionInfo.maxDate = CommonState.streamFlowStatMaxDate;
                    } else if (StoredState.streamFlowStatHucFeature) {
                        selectionInfo.hucId = StoredState.streamFlowStatHucFeature.data.HUC12;
                        selectionInfo.hucName = StoredState.streamFlowStatHucFeature.data.HU_12_NAME;
                        selectionInfo.drainageArea = StoredState.streamFlowStatHucFeature.data.DRAIN_SQKM;
                        StoredState.readyForModeledQ = true;
                    } else {
                        $state.go('^.selectSite');
                        return;
                    }
                } else {
                    $state.go('^.selectSite');
                    return;
                }
                
                $scope.selectionInfo = selectionInfo;
                $scope.streamStatsOptions = StreamStats.getAllStatTypes();
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;
                StoredState.siteStatisticsParameters = StoredState.siteStatisticsParameters || {};
                var siteStatisticsParameters = StoredState.siteStatisticsParameters;
                $scope.siteStatisticsParameters = siteStatisticsParameters;
                siteStatisticsParameters.statGroups = siteStatisticsParameters.statGroups || [];
                siteStatisticsParameters.startDate =  siteStatisticsParameters.startDate || Date.create(CommonState.streamFlowStatMinDate).utc();
                CommonState.streamFlowStatMaxDate = siteStatisticsParameters.endDate || Date.create(CommonState.streamFlowStatMaxDate).utc();
                siteStatisticsParameters.endDate =  siteStatisticsParameters.endDate || Date.create(CommonState.streamFlowStatMaxDate).utc();
                CommonState.streamFlowStatMinDate = siteStatisticsParameters.startDate.clone();
                CommonState.streamFlowStatMaxDate = siteStatisticsParameters.endDate.clone();
                
                $scope.dateFormat = 'yyyy-MM-dd';
                $scope.minDate = CommonState.streamFlowStatMinDate;
                $scope.maxDate = CommonState.streamFlowStatMaxDate;
                
                var wyRange = WaterYearUtil.waterYearRange(Date.range($scope.minDate, $scope.maxDate));
                $scope.years = WaterYearUtil.yearsAsArray(wyRange);
                $scope.startYear = $scope.years.first();
                $scope.endYear = $scope.years.last();

                $scope.$watch('startYear', function(newValue, oldValue) {
                    if (newValue !== oldValue) {
                        siteStatisticsParameters.startDate = WaterYearUtil.waterYearStart(newValue);
                        if (newValue > $scope.endYear) {
                            alert('Start cannot be after end');
                            $scope.startYear = oldValue;
                        }
                    }
                });
                $scope.$watch('endYear', function(newValue, oldValue) {
                    if (newValue !== oldValue) {
                        siteStatisticsParameters.endDate = WaterYearUtil.waterYearEnd(newValue);
                        if (newValue < $scope.startYear) {
                            alert('End cannot be before start');
                            $scope.endYear = oldValue;
                        }
                    }
                });
                    
                $scope.calculateStats = function () {
                  StoredState.streamflowStatsParamsReady = true;
                  $state.go('^.displayStatistics');
                };
            }
        )
    ]);
    
    streamflowStatistics.controller('DisplayStatistics', ['$scope', 'StoredState', 'CommonState', 'StoredState', '$state',
        NWC.ControllerHelpers.StepController(
            {
                name: 'View Statistics',
                description: 'Visualize and export the statistics for the selected site.'
            },
            function ($scope, StoredState, CommonState, StoredState, $state) {
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;
                CommonState.showStreamflowPlot = CommonState.showStreamflowPlot || false;
                var selectionInfo = {};
                
                if(StoredState.gage){
                    selectionInfo.gageId = StoredState.gage.data.STAID;
                    selectionInfo.gageName = StoredState.gage.data.STANAME;
                    selectionInfo.drainageArea = StoredState.gage.data.DRAIN_SQKM;
                    selectionInfo.minDate = CommonState.streamFlowStatMinDate;
                    selectionInfo.maxDate = CommonState.streamFlowStatMaxDate;
                } else if (StoredState.streamFlowStatHucFeature) {
                    selectionInfo.hucId = StoredState.streamFlowStatHucFeature.data.HUC12;
                    selectionInfo.hucName = StoredState.streamFlowStatHucFeature.data.HU_12_NAME;
                    selectionInfo.drainageArea = StoredState.streamFlowStatHucFeature.data.DRAIN_SQKM;
                    StoredState.readyForModeledQ = true;
                } else {
                    $state.go('^.selectSite');
                }
                $scope.selectionInfo = selectionInfo;

            }
        )
    ]);

}());
