Pod::Spec.new do |s|
  s.name = 'GfcRoomScan'
  s.version = '0.1.0'
  s.summary = 'Camera room measuring for GFC Floor Quote'
  s.license = 'UNLICENSED'
  s.homepage = 'https://gomezflooringcompany.store'
  s.author = 'Gomez Flooring Company'
  s.source = { :git => 'https://gomezflooringcompany.store', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.swift'
  s.ios.deployment_target = '13.0'
  s.weak_frameworks = 'RoomPlan'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
