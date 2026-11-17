// Edit this file to change the homescreen.
// Each row has a title and a list of tiles. "id" is the Tizen app ID,
// or use "url" instead to open a website in the TV's browser.
// Check an ID exists on the TV with (from a computer on the same network):
//   curl "http://<TV_IP>:8086/apps?q=<name>"   (the launcher's own service)
// "color" is the brand colour shown as the tile's glow and top bar.
// Max 5 tiles per row fit on screen.
var LAUNCHER_ROWS = [
    {
        title: '',
        tiles: [
            { name: 'Netflix',    id: 'org.tizen.netflix-app', color: '#e50914' },
            { name: 'YouTube',    id: '9Ur5IzDKqV.TizenYouTube', color: '#ff0033' },
            { name: 'Paramount+', id: 'rJyOSqC6Up.PPlusIntl', color: '#0064ff' },
            { name: 'Disney+',    id: 'MCmYXNxgcu.DisneyPlus', color: '#1fb6c9' },
            { name: 'RaiPlay',    id: '5im3FztIhW.RaiTVtizen', color: '#2f6fff' }
        ]
    }
];
