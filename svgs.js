const { optimize } = require("svgo");

module.exports = {
    singleSvg: function(img) {
        return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1202" height="600" viewBox="0,0,600,600">
        <rect width="600" height="600" fill="black" />
        <svg width="600" height="600" x="0" y="0">${img}</svg>
        </svg>`).data;
    },
    doubleSvg: function(img1, img2)  {
        return optimize(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1202" height="600" viewBox="0,0,1202,600">
        <rect width="1202" height="600" fill="black" />
        <svg width="600" height="600" x="0" y="0">${img1}</svg>
        <svg width="600" height="600" x="602" y="0">${img2}</svg>
        <rect width="2" height="600" x="600" y="0" fill="red" />
        </svg>`).data;
    }
}