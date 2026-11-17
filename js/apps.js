// Edit this file to change the homescreen.
// Each row has a title and a list of tiles. "id" is the Tizen app ID,
// or use "url" instead to open a website in the TV's browser.
// Check an ID exists on the TV with (from a computer on the same network):
//   curl http://<TV_IP>:8001/api/v2/applications/<id>
// "color" is the brand colour shown as the tile's glow and top bar.
// Max 5 tiles per row fit on screen.
var LAUNCHER_ROWS = [
    {
        title: '',
        tiles: [
            { name: 'Netflix',    id: '3201907018807', color: '#e50914' },
            { name: 'YouTube',    id: '111299001912',  color: '#ff0033' },
            { name: 'Paramount+', id: '3202110025305', color: '#0064ff' },
            { name: 'Disney+',    id: '3201901017640', color: '#1fb6c9' },
            { name: 'RaiPlay',    id: '111399002034',  color: '#2f6fff' }
        ]
    }
];
