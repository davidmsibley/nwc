/*global angular*/
(function () {
    var aquaticBiologyControllers = angular.module('nwc.controllers.aquaticBiology', []);
    aquaticBiologyControllers.controller('AquaticBiology', [ '$scope', 'StoredState', '$sce',
        NWC.ControllerHelpers.WorkflowController(
            {
                name: "Aquatic Biology Data and Related Streamflow Statistics",
                description: " Access aquatic biology data from the \n\
                    <a href=\"https://aquatic.biodata.usgs.gov\" target=\"_blank\">BioData</a> \n\
                    database and calculate streamflow statistics for near-by stream gages\n\
                    or model results. Select a collection of aquatic biology sites and\n\
                    access the data from the BioData system. Coming Soon: Select a collection\n\
                    of related stream-flow gages, specify a time range of interest, and\n\
                    choose statistics to receive. Software to calculate these statistics\n\
                    is also available as an open-source package on GitHub:\n\
                    <a href=\"https://github.com/USGS-R/EflowStats\" target=\"_blank\">\n\
                    https://github.com/USGS-R/EflowStats <i class=\"fa fa-external-link\"></i>."
            },
            function($scope, StoredState, $sce){
                $scope.description = $sce.trustAsHtml($scope.description);
                $scope.observedSelected = function() {
                    var result = 'observed' === StoredState.interestType;
                    return result;
                };
                $scope.modeledSelected = function() {
                    var result = 'modeled' === StoredState.interestType;
                    return result;
                };
            }
        )
    ]);
    aquaticBiologyControllers.controller('SelectBioDataSite', [ '$scope', 'StoredState', 'CommonState', 'AquaticBiologyMap', 'MapControlDescriptions',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Aquatic Biology Site Selection Map',
                description: 'Via the map interface, explore aquatic biology sites across the nation and select them to pursue further investigation in BioData'
            },
            function($scope, StoredState, CommonState, AquaticBiologyMap, MapControlDescriptions){
            
                var map = AquaticBiologyMap.getMap();
                map.render('bioSiteSelectMap');
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
        
                $scope.StoredState = StoredState;
                $scope.CommonState = CommonState;
                
                $scope.$watch('StoredState.interestType', function(newInterest, oldInterest) {
                    if(newInterest !== oldInterest){
                        AquaticBiologyMap.getMap().switchToInterest(newInterest);
//                        CommonState.interestTypeDescription = interestTypeDescriptions[newInterest];
                    }
                });
                
                $scope.$watch('CommonState.activatedMapControl', function(newControl, oldControl) {
                    var controlId;
                    if (newControl === 'zoom') {
                        controlId = 'nwc-zoom';
                    } else if (newControl === 'pan') {
                        controlId = 'nwc-navigation';
                    } else {
                        controlId = 'nwc-biodata-sites';
                    }
                    if (newControl !== oldControl) {
                        var controls = AquaticBiologyMap.getMap().getControlsBy('id', /nwc-.*/);
                        angular.forEach(controls, function(control) {
                            control.deactivate();
                        });
                    }
                    var activeControl = AquaticBiologyMap.getMap().getControlsBy('id', controlId)[0];
                    activeControl.activate();
                    CommonState.mapControlDescription = MapControlDescriptions[newControl].description;
                    CommonState.mapControlCursor = MapControlDescriptions[newControl].cursor;
                });
                
                CommonState.activatedMapControl = 'biosites';
                CommonState.mapControlDescription = MapControlDescriptions[CommonState.activatedMapControl].description;
                CommonState.mapControlCursor = MapControlDescriptions[CommonState.activatedMapControl].cursor;
                
            }
        )
    ]);
    aquaticBiologyControllers.controller('ShowSelectedBioDataSites', ['$scope', 'StoredState', 'CommonState', 'StoredState',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Aquatic Biology Site Selection List',
                description: 'Select which sites to explore in BioShare'
            },
            function ($scope, StoredState, CommonState, StoredState) {
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;
                StoredState.selectedAquaticBiologySites = StoredState.selectedAquaticBiologySites || [];

                $scope.noSitesSelected = function () {
                    //boolean cast
                    return StoredState.selectedAquaticBiologySites.length === 0;
                };
            }
        )
    ]);
    
    var bioDataSiteSelectionDoc; //lazy-loaded
    
    aquaticBiologyControllers.controller('SendToBioData', ['$scope', 'StoredState', 'CommonState', 'StoredState',
        NWC.ControllerHelpers.StepController(
            {
                name: 'Preparing To Explore in BioData',
                description: 'Please wait...'
            },
            function ($scope, StoredState, CommonState, StoredState) {
                $scope.CommonState = CommonState;
                $scope.StoredState = StoredState;

                /**
                 * @param {array<String>} siteIds
                 */
                var preselectBioDataSites = function (siteIds) {
                    var doc = bioDataSiteSelectionDoc;
                    var siteNumbersElt = $(doc).find('siteNumbers').empty()[0];
                    siteIds.each(function (siteId) {
                        var child = doc.createElement('siteNumber');
                        child.textContent = siteId;
                        siteNumbersElt.appendChild(child);
                    });

                    //serialize xml document
                    var xmlString;
                    //IE
                    if (window.ActiveXObject) {
                        xmlString = doc.xml;
                    } else {
                        // code for Mozilla, Firefox, Opera, etc.
                        xmlString = (new XMLSerializer()).serializeToString(doc);
                    }

                    $("[name='currentQuery']").val(xmlString);
                    $('#bioData_form').submit();
                };
                var siteIds = StoredState.selectedAquaticBiologySites;

                if (bioDataSiteSelectionDoc) {
                    preselectBioDataSites(siteIds);
                } else {
                    //retrieve document from server
                    $.when($.get('../client/nwc/misc/BioDataSiteSelection.xml')).then(
                        function (response, status, jqXHR) {
                            bioDataSiteSelectionDoc = response;
                            preselectBioDataSites(siteIds);
                        },
                        function (response, status, jqXHR) {
                            alert("Error Retrieving BioData query skeleton");
                        }
                    );

                }
            }
        )
    ]);
}());
