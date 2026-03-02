// export-wpml.js

function createWPMLFiles(currentLawnmowerPath, photoIntervalMeters, speed = 1.3, lens = 'wide') {
  const timestamp = Date.now();
  const flightHeight = currentLawnmowerPath[0].alt;

  // Optimal Mapping Camera Settings
  const shutterSpeed = 0.001; // 1/1000s to eliminate motion blur
  const isoXml = ''; // Empty means Auto ISO to compensate for fixed fast shutter
  const exposureMode = 'shutterPriority';
  const dewarpEnable = 0; // Off for better photogrammetry results

  // Lens specific DJI configuration
  // For Air 3S (droneEnumValue 77), payload 67. 
  // Wide camera is subEnum 0. Medium Tele is subEnum 1.
  const subEnumVal = lens === 'tele' ? 1 : 0;
  // Position index is standard 0
  const posIndex = 0;

  // Generates template.kml
  let templateKML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Dronemap</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>goHome</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <!-- 77 for Mavic 3E. Air 3S supports WPML through Pilot 2 or similar API -->
        <wpml:droneEnumValue>77</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>67</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${subEnumVal}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>${posIndex}</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      
      <!-- Standard KML for Google Earth Visualization -->
      <Placemark>
        <name>Flight Path</name>
        <Style>
          <LineStyle>
            <color>ff0000ff</color>
            <width>3</width>
          </LineStyle>
          <PolyStyle>
            <color>7f0000ff</color>
          </PolyStyle>
        </Style>
        <LineString>
          <extrude>1</extrude>
          <altitudeMode>relativeToGround</altitudeMode>
          <coordinates>
${currentLawnmowerPath.map(pt => `${pt.lng},${pt.lat},${pt.alt}`).join('\n')}
          </coordinates>
        </LineString>
      </Placemark>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>${posIndex}</wpml:payloadPositionIndex>
        <wpml:focusMode>firstPoint</wpml:focusMode>
        <wpml:meteringMode>average</wpml:meteringMode>
        <!-- Mapping Settings -->
        <wpml:dewarpingEnable>${dewarpEnable}</wpml:dewarpingEnable>
        <wpml:returnMode>downloadToAppAndSaveToSdMode</wpml:returnMode>
        <!-- Exposure Settings (Shutter Priority, ISO) -->
        <wpml:exposureMode>${exposureMode}</wpml:exposureMode>
        <wpml:shutterSpeed>${shutterSpeed}</wpml:shutterSpeed>
        ${isoXml}
      </wpml:payloadParam>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <Placemark>
        <Point>
          <!-- Using the first waypoint for template representation -->
          <coordinates>${currentLawnmowerPath[0].lng},${currentLawnmowerPath[0].lat}</coordinates>
        </Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

  // Generates waylines.wpml
  let waylinesWPML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Dronemap</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
`;

  currentLawnmowerPath.forEach((pt, index) => {
    const hasPoi = pt.poi !== undefined;
    const headingMode = hasPoi ? 'towardPOI' : 'followWayline';
    const poiStr = hasPoi ? `${pt.poi.lng},${pt.poi.lat},0.000000` : `0.000000,0.000000,0.000000`;

    waylinesWPML += `
      <Placemark>
        <Point>
          <coordinates>${pt.lng},${pt.lat}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${pt.alt}</wpml:executeHeight>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${headingMode}</wpml:waypointHeadingMode>
          <wpml:waypointPoiPoint>${poiStr}</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurve</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>1</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
    `;

    // Add actionGroup to initiate mapping sequence or change gimbal pitch
    const targetPitch = pt.gimbalPitch !== undefined ? pt.gimbalPitch : -90;

    let needsPitchAction = false;
    // We must initialize the pitch at point 0, and update it whenever it changes on subsequent points
    if (index === 0) {
      needsPitchAction = true;
    } else if (targetPitch !== currentPitch) {
      needsPitchAction = true;
    }

    if (needsPitchAction) {
      waylinesWPML += `
      < wpml: actionGroup >
          <wpml:actionGroupId>${index}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${index}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionFunc>gimbalEvenlyRotate</wpml:actionFunc>
            <wpml:actionFuncParam>
              <wpml:gimbalPitchRotateAngle>${targetPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:payloadPositionIndex>${posIndex}</wpml:payloadPositionIndex>
            </wpml:actionFuncParam>
          </wpml:action>
        </wpml: actionGroup >
      `;
      currentPitch = targetPitch;
    }

    // On the very last waypoint, let's explicitly add a stop flying / return to home or stop photo action 
    // just for safety, though finishAction=goHome in template.kml handles the actual RTH.


    waylinesWPML += `      </Placemark >\n`;
  });

  waylinesWPML += `    </Folder >
  </Document >
</kml > `;

  return { templateKML, waylinesWPML };
}

// Add export listener
document.getElementById('btnExportKMZ').addEventListener('click', async () => {
  if (!currentLawnmowerPath || currentLawnmowerPath.length === 0) return;



  const flightHeight = currentLawnmowerPath[0].alt;
  const AIR3S_FOV_V = 53.1;
  const fovV_rad = (AIR3S_FOV_V * Math.PI) / 180;
  const footprintHeight = 2 * flightHeight * Math.tan(fovV_rad / 2);

  // Front Overlap is used for distance interval
  const frontOverlap = (parseFloat(document.getElementById('mapFrontOverlap').value) || 80) / 100;
  const photoIntervalMeters = footprintHeight * (1 - frontOverlap);
  const speed = parseFloat(document.getElementById('mapSpeed').value) || 1.3;
  const lens = document.getElementById('mapCameraLens') ? document.getElementById('mapCameraLens').value : 'wide';

  const { templateKML, waylinesWPML } = createWPMLFiles(currentLawnmowerPath, photoIntervalMeters, speed, lens);

  // Create zip
  const zip = new JSZip();
  const wpmzFolder = zip.folder("wpmz");
  wpmzFolder.file("template.kml", templateKML);
  wpmzFolder.file("waylines.wpml", waylinesWPML);

  try {
    const content = await zip.generateAsync({ type: "blob" });

    // Trigger download
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission_${Date.now()}.kmz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);


  } catch (err) {
    console.error("Failed to generate zip", err);

  }
});
