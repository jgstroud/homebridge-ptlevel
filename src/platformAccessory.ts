import axios from 'axios';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from './platform';
import { apiType } from './platform';
import { setFlagsFromString } from 'v8';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ExamplePlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  private currentLevel;
  private lastLevel;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly ptApi: apiType,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.HumiditySensor) || this.accessory.addService(this.platform.Service.HumiditySensor);
    this.currentLevel = 0;
    this.lastLevel = 0;

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getLevel.bind(this));               // GET - bind to the `getLevel` method below

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    this.pollLevel();
    setInterval(() => {
      // EXAMPLE - inverse the trigger
      this.pollLevel();
    }, 60000);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async pollLevel() {
    let newValue = 0;

    if (this.ptApi === apiType.localApi) {
      const { data } = await axios.get('http://' + this.accessory.context.device.localIp + '/get_sensors', {});
      const sensor_data = JSON.parse(data.local_s);
      const zero = sensor_data[0]['z'];
      const ad = sensor_data[0]['1'];

      newValue = Math.round((ad - zero) * this.accessory.context.device.calFactor);
    } else if (this.ptApi === apiType.publicApi) {
      const { data } = await axios.get('https://www.mypt.in/device/' + this.accessory.context.device.cameraId, {});
      newValue = data.percentLevel;
    }

    // push the new value to HomeKit
    if (newValue != this.lastLevel) {
      this.platform.log.debug('dbg: update', this.accessory.context.device.exampleDisplayName, newValue);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, newValue);
    }

    const delta = this.currentLevel - newValue;
    if (delta < -1 || delta > 1) {
      this.platform.log.info(this.accessory.context.device.exampleDisplayName, newValue);
      this.currentLevel = newValue;
    }
    this.lastLevel = newValue;
  }

  async getLevel(): Promise<CharacteristicValue> {
    return this.lastLevel;
  }
}
