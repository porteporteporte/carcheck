export function carDataFromAutoRia(car) {
  return {
    make: car.markName,
    model: car.modelName,
    year: car.autoData?.year,
    engine: car.autoData?.engineVolume ? car.autoData.engineVolume + 'L' : '—',
    country: car.stateData?.name,
    mileage: car.autoData?.raceInt,
    price: car.USD,
    fuel: car.autoData?.fuelName,
  }
}

export function carDataFromNHTSA(r) {
  return {
    make: r.Make,
    model: r.Model,
    year: r.ModelYear,
    engine: r.DisplacementL ? parseFloat(r.DisplacementL).toFixed(1) + 'L' : '—',
    country: r.PlantCountry,
  }
}

export function getAutoRiaPhoto(car) {
  if (!car) return null
  return car.photoData?.seoLinkF || car.photoData?.seoLinkM || null
}

export function parseAutoRiaId(input) {
  var match = input.match(/[_-](\d{7,})\.html/)
  if (!match) match = input.match(/auto_id=(\d+)/)
  if (!match) match = input.match(/\/(\d{7,})$/)
  return match ? match[1] : null
}

export function formatCarName(car) {
  var parts = [car.markName, car.modelName, car.autoData?.year]
  return parts.filter(Boolean).join(' ') || 'Без назви'
}

export function formatCarMeta(car) {
  var parts = []
  if (car.autoData?.raceInt) parts.push(car.autoData.raceInt.toLocaleString() + ' км')
  if (car.stateData?.name) parts.push(car.stateData.name)
  if (car.autoData?.fuelName) parts.push(car.autoData.fuelName)
  return parts.join(' · ') || '—'
}