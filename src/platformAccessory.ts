import axios from 'axios';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { PTLevelHomebridgePlatform } from './platform';
import { PTapiType } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PTLevelPlatformAccessory {
  private service: Service;

  private lastLevel;

  constructor(
    private readonly platform: PTLevelHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ParemTech')
      .setCharacteristic(this.platform.Characteristic.Model, 'PTLevel')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.DeviceId);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.HumiditySensor)
        || this.accessory.addService(this.platform.Service.HumiditySensor);
    this.lastLevel = 0;

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.TankDisplayName);

    // register handlers for the On/Off Characteristic
    //this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
    //  .onGet(this.getLevel.bind(this));               // GET - bind to the `getLevel` method below
    const refresh = platform.config.refresh * 1000;
    this.platform.log.debug('Setting refresh to', refresh);

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
      this.pollLevel();
    }, refresh);
  }

  async pollLevel() {
    let newValue = 0;
    let api_error = false;

    if (this.platform.ptApi === PTapiType.localApi) {
      //this.platform.log.debug('get http://' + this.accessory.context.device.DeviceId + '/get_sensors');
      await axios.get('http://' + this.accessory.context.device.DeviceId + '/get_sensors', {
        timeout: 5000, // Set a timeout of 5 seconds
      })
        .then(response => {
          const sensor_data = JSON.parse(response.data.local_s);
          const zero = sensor_data[0]['z'];
          const ad = sensor_data[0]['1'];

          newValue = Math.round((ad - zero) * this.accessory.context.device.calFactor);
        })
        .catch(error => {
          if (error.code === 'ECONNABORTED') {
            this.platform.log.debug('Request timed out accessing', this.accessory.context.displayName,
              this.accessory.context.device.DeviceId);
          } else {
            this.platform.log.debug(error.message);
          }
          api_error = true;
        });
    } else if (this.platform.ptApi === PTapiType.publicApi) {
      //this.platform.log.debug('get https://www.mypt.in/device/' + this.accessory.context.device.DeviceId);
      await axios.get('https://www.mypt.in/device/' + this.accessory.context.device.DeviceId, {
        timeout: 5000, // Set a timeout of 5 seconds
      })
        .then(response => {
          newValue = response.data.percentLevel;
        })
        .catch(error => {
          if (error.code === 'ECONNABORTED') {
            this.platform.log.debug('Request timed out accessing', this.accessory.context.displayName,
              this.accessory.context.device.DeviceId);
          } else {
            this.platform.log.debug(error.message);
          }
          api_error = true;
        });
    }

    if (api_error) {
      return;
    }

    //this.platform.log.debug(this.accessory.context.device.TankDisplayName, newValue);

    // push the new value to HomeKit
    if (newValue !== this.lastLevel) {
      this.platform.log.debug('update', this.accessory.context.device.TankDisplayName, newValue);
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, newValue);
    }

    this.lastLevel = newValue;
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
  async getLevel(): Promise<CharacteristicValue> {
    return this.lastLevel;
  }
}
