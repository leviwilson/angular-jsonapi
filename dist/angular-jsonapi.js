(function() {
  'use strict';

  angular.module('angularJsonapi', ['uuid4']);

})();

// from https://www.sitepen.com/blog/2012/10/19/lazy-property-access/
(function() {
  'use strict';

  angular.module('angularJsonapi')
    .constant('lazyProperty', function(target, propertyName, callback) {
      var result;
      var done;
      Object.defineProperty(target, propertyName, {
        get: function() { // Define the getter
          if (!done) {
            // We cache the result and only compute once.
            done = true;
            result = callback.call(target);
          }

          return result;
        },

        // Keep it enumerable and configurable, certainly not necessary.
        enumerable: true,
        configurable: true
      });
    });

})();

(function() {
  'use strict';

  angular.module('angularJsonapi').config(['$provide', function($provide) {
    $provide.decorator('$q', ['$delegate', function($delegate) {
      var $q = $delegate;

      $q.allSettled = $q.allSettled || function allSettled(promises) {
        // Implementation of allSettled function from Kris Kowal's Q:
        // https://github.com/kriskowal/q/wiki/API-Reference#promiseallsettled
        // by Michael Kropat from http://stackoverflow.com/a/27114615/1400432 slightly modified

        var wrapped = angular.isArray(promises) ? [] : {};

        angular.forEach(promises, function(promise, key) {
          if (!wrapped.hasOwnProperty(key)) {
            wrapped[key] = wrap(promise);
          }
        });

        return $q.all(wrapped);

        function wrap(promise) {
          return $q.when(promise)
            .then(function(value) {
              return { success: true, value: value };
            },

            function(reason) {
              return { success: false, reason: reason };
            });
        }
      };

      return $q;
    }]);
  }]);

})();

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPISynchronization', AngularJsonAPISynchronizationWrapper);

  function AngularJsonAPISynchronizationWrapper($q) {
    AngularJsonAPISynchronization.prototype.before = beforeSynchro;
    AngularJsonAPISynchronization.prototype.after = afterSynchro;
    AngularJsonAPISynchronization.prototype.begin = begin;
    AngularJsonAPISynchronization.prototype.finish = finish;
    AngularJsonAPISynchronization.prototype.synchronization = synchronization;
    AngularJsonAPISynchronization.prototype.synchronize = synchronize;
    AngularJsonAPISynchronization.prototype.extend = extend;

    return AngularJsonAPISynchronization;

    function AngularJsonAPISynchronization() {
      var _this = this;
      var allHooks = [
        'add',
        'init',
        'get',
        'all',
        'clear',
        'remove',
        'removeLink',
        'removeLinkReflection',
        'addLink',
        'addLinkReflection',
        'update',
        'refresh'
      ];

      _this.state = {};

      _this.beginHooks = {};
      _this.beforeHooks = {};
      _this.synchronizationHooks = {};
      _this.afterHooks = {};
      _this.finishHooks = {};

      _this.options = {};

      angular.forEach(allHooks, function(hookName) {
        _this.beginHooks[hookName] = [];
        _this.beforeHooks[hookName] = [];
        _this.synchronizationHooks[hookName] = [];
        _this.afterHooks[hookName] = [];
        _this.finishHooks[hookName] = [];
        _this.state[hookName] = {
          loading: false,
          success: true
        };
      });
    }

    function extend(synchronization) {
      var _this = this;

      extendHooks('beginHooks');
      extendHooks('beforeHooks');
      extendHooks('synchronizationHooks');
      extendHooks('afterHooks');
      extendHooks('finishHooks');

      function extendHooks(hooksKey) {
        angular.forEach(synchronization[hooksKey], function(hooks, key) {
          _this[hooksKey][key] = _this[hooksKey][key].concat(hooks);
        });
      }

      angular.extend(_this.options, synchronization.options);
    }

    function begin(action, callback) {
      var _this = this;

      _this.beginHooks[action].push(callback);
    }

    function finish(action, callback) {
      var _this = this;

      _this.finishHooks[action].push(callback);
    }

    function beforeSynchro(action, callback) {
      var _this = this;

      _this.beforeHooks[action].push(callback);
    }

    function afterSynchro(action, callback) {
      var _this = this;

      _this.afterHooks[action].push(callback);
    }

    function synchronization(action, callback) {
      var _this = this;

      _this.synchronizationHooks[action].push(callback);
    }

    function synchronize(action, collection, object, linkSchema, linkedObject, params) {
      var _this = this;
      var promises = [];

      _this.state[action].loading = true;

      if (object !== undefined) {
        object.loadingCount += 1;
      }

      if (collection !== undefined) {
        collection.loadingCount += 1;
      }

      angular.forEach(_this.beginHooks[action], function(hook) {
        hook.call(_this, collection, object, linkSchema, linkedObject, params);
      });

      angular.forEach(_this.beforeHooks[action], function(hook) {
        hook.call(_this, collection, object, linkSchema, linkedObject, params);
      });

      angular.forEach(_this.synchronizationHooks[action], function(hook) {
        promises.push(hook.call(_this, collection, object, linkSchema, linkedObject, params));
      });

      $q.allSettled(promises).then(function(results) {
        _this.state[action].success = true;
        angular.forEach(results, function(result) {
          if (result.success === false) {
            _this.state[action].success = false;
          }
        });

        angular.forEach(_this.afterHooks[action], function(hook) {
          hook.call(_this, collection, object, linkSchema, linkedObject, params, results);
        });

        angular.forEach(_this.finishHooks[action], function(hook) {
          hook.call(_this, collection, object, linkSchema, linkedObject, params);
        });

        _this.state[action].loading = false;

        if (object !== undefined) {
          object.loadingCount -= 1;
        }

        if (collection !== undefined) {
          collection.loadingCount -= 1;
        }
      });
    }

  }
  AngularJsonAPISynchronizationWrapper.$inject = ["$q"];
})();

(function() {
  'use strict';

  angular.module('angularJsonapiRest', ['angularJsonapi'])
  .factory('AngularJsonAPISynchronizationRest', AngularJsonAPISynchronizationRestWrapper);

  function AngularJsonAPISynchronizationRestWrapper(AngularJsonAPISynchronization, $q, $http) {

    AngularJsonAPISynchronizationRest.prototype = Object.create(AngularJsonAPISynchronization.prototype);
    AngularJsonAPISynchronizationRest.prototype.constructor = AngularJsonAPISynchronizationRest;

    return AngularJsonAPISynchronizationRest;

    function AngularJsonAPISynchronizationRest(url) {
      var _this = this;

      AngularJsonAPISynchronization.call(_this);

      _this.synchronization('remove', remove);
      _this.synchronization('removeLink', removeLink);
      _this.synchronization('addLink', addLink);
      _this.synchronization('update', update);
      _this.synchronization('add', add);
      _this.synchronization('all', all);
      _this.synchronization('get', get);
      _this.synchronization('refresh', get);
      _this.after('all', afterAll);
      _this.after('get', afterGet);
      _this.after('refresh', afterGet);

      function wrapResp(data, status, headers, config) {
        return {
          data: data,
          status: status,
          headers: headers,
          config: config
        };
      }

      function afterAll(collection, object, linkSchema, linkedObject, params, results) {
        var rawData = results[0].value.data.data;
        var included = results[0].value.data.included;

        if (results[0].success === true && rawData !== undefined) {
          var indexedData = {};
          angular.forEach(rawData, function(data) {
            indexedData[data.id] = data;
            collection.addOrUpdate(data);
          });

          angular.forEach(collection.data, function(data) {
            if (indexedData[data.id] === undefined) {
              collection.__remove(data.id);
            }
          });

          angular.forEach(included, function(object) {
            collection.allCollections[object.type].addOrUpdate(object);
          });
        }
      }

      function afterGet(collection, object, linkSchema, linkedObject, params, results) {
        var data;
        var included;

        if (results[0].success === true) {
          data = results[0].value.data.data;
          included = results[0].value.data.included;
          collection.addOrUpdate(data);

          angular.forEach(included, function(object) {
            collection.allCollections[object.type].addOrUpdate(object);
          });
        } else {
          object.error = true;
          object.__remove();
          collection.__remove(object.data.id);
        }
      }

      function all(collection, object, params) {
        var deferred = $q.defer();
        var config = {
          method: 'GET',
          url: url,
          params: params || {}
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;
      }

      function get(collection, object, linkSchema, linkedObject, params) {
        var deferred = $q.defer();
        var config;
        var ids;

        if (angular.isArray(object)) {
          ids = [];
          angular.forEach(object, function(object) {
            ids.push(object.data.id);
          });
        } else {
          ids = object.data.id;
        }

        config = {
          method: 'GET',
          url: url + '/' + ids.toString(),
          params: params || {}
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;
      }

      function remove(collection, object) {
        var deferred = $q.defer();
        var config = {
          method: 'DELETE',
          url: url + '/' + object.data.id
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;
      }

      function removeLink(collection, object, linkKey, linkedObject) {
        var deferred = $q.defer();
        var config;

        if (object.removed === true || linkedObject === undefined) {
          deferred.resolve();
        } else {
          config = {
            method: 'DELETE',
            url: url + '/' + object.data.id + '/links/' + linkKey,
            data: {data: linkedObject.toLink()}
          };

          $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });
        }

        return deferred.promise;
      }

      function addLink(collection, object, linkKey, linkedObject) {
        var deferred = $q.defer();
        var config = {
          method: 'POST',
          url: url + '/' + object.data.id + '/links/' + linkKey,
          data: {data: linkedObject.toLink()}
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;

      }

      function update(collection, object) {
        var deferred = $q.defer();
        var config = {
          method: 'PATCH',
          url: url + '/' + object.data.id,
          data: {data: object.toPatchData()}
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;
      }

      function add(collection, object) {
        var deferred = $q.defer();
        var config = {
          method: 'POST',
          url: url + '/' + object.data.id,
          data: {data: object.toJson()}
        };

        $http(config).
          success(function(data, status, headers, config) {
            deferred.resolve(wrapResp(data, status, headers, config));
          }).
          error(function(data, status, headers, config) {
            deferred.reject(wrapResp(data, status, headers, config));
          });

        return deferred.promise;
      }
    }
  }
  AngularJsonAPISynchronizationRestWrapper.$inject = ["AngularJsonAPISynchronization", "$q", "$http"];
})();

(function() {
  'use strict';

  angular.module('angularJsonapiLocal', ['angularJsonapi'])
  .factory('AngularJsonAPISynchronizationLocal', AngularJsonAPISynchronizationLocalWrapper);

  function AngularJsonAPISynchronizationLocalWrapper(AngularJsonAPISynchronization, $window) {

    AngularJsonAPISynchronizationLocal.prototype = Object.create(AngularJsonAPISynchronization.prototype);
    AngularJsonAPISynchronizationLocal.prototype.constructor = AngularJsonAPISynchronizationLocal;

    return AngularJsonAPISynchronizationLocal;

    function AngularJsonAPISynchronizationLocal(prefix) {
      var _this = this;

      _this.__updateStorage = updateStorage;

      AngularJsonAPISynchronization.call(_this);

      _this.begin('init', init);
      _this.begin('clear', clear);
      _this.begin('remove', updateStorage);
      _this.begin('removeLink', updateStorage);
      _this.begin('removeLinkReflection', updateStorage);
      _this.begin('addLink', updateStorage);
      _this.begin('addLinkReflection', updateStorage);
      _this.begin('update', updateStorage);
      _this.begin('add', updateStorage);
      _this.finish('get', updateStorage);
      _this.finish('all', updateStorage);

      _this.finish('init', updateStorage);
      _this.finish('clear', updateStorage);
      _this.finish('remove', updateStorage);
      _this.finish('removeLink', updateStorage);
      _this.finish('removeLinkReflection', updateStorage);
      _this.finish('addLink', updateStorage);
      _this.finish('addLinkReflection', updateStorage);
      _this.finish('update', updateStorage);
      _this.finish('add', updateStorage);
      _this.finish('get', updateStorage);
      _this.finish('all', updateStorage);

      function init(collection) {
        var datas = $window.localStorage.getItem(prefix + '.' + collection.Model.prototype.schema.type);
        collection.fromJson(datas);
      }

      function clear(collection) {
        $window.localStorage.removeItem(prefix + '.' + collection.Model.prototype.schema.type);
      }

      function updateStorage(collection) {
        $window.localStorage.setItem(prefix + '.' + collection.Model.prototype.schema.type, collection.toJson());
      }
    }
  }
  AngularJsonAPISynchronizationLocalWrapper.$inject = ["AngularJsonAPISynchronization", "$window"];
})();

/*jshint expr: true*/
'use strict';

describe('AngularJsonAPICollection factory', function() {

  beforeEach(module('angularJsonapi'));

  it('returns valid model', inject(function(AngularJsonAPICollection) {
    expect(AngularJsonAPICollection).to.be.ok;
  }));

});

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPICollection', AngularJsonAPICollectionWrapper);

  function AngularJsonAPICollectionWrapper(
    $log,
    uuid4,
    JsonAPIModelFactory,
    AngularJsonAPISchema
  ) {
    AngularJsonAPICollection.prototype.allCollections = {};

    AngularJsonAPICollection.prototype.__synchronize = __synchronize;
    AngularJsonAPICollection.prototype.__get = __get;
    AngularJsonAPICollection.prototype.__remove = __remove;

    AngularJsonAPICollection.prototype.get = get;
    AngularJsonAPICollection.prototype.all = all;
    AngularJsonAPICollection.prototype.remove = remove;
    AngularJsonAPICollection.prototype.clear = clear;
    AngularJsonAPICollection.prototype.fromJson = fromJson;
    AngularJsonAPICollection.prototype.toJson = toJson;
    AngularJsonAPICollection.prototype.addOrUpdate = addOrUpdate;

    return AngularJsonAPICollection;

    function AngularJsonAPICollection(schema, synchronization) {
      var _this = this;

      var schemaObj = new AngularJsonAPISchema(schema);

      _this.Model = JsonAPIModelFactory.model(
        schemaObj,
        _this.allCollections,
        _this
      );

      _this.synchronization = synchronization;

      _this.loadingCount = 0;
      _this.data = {};
      _this.removed = {};
      _this.schema = schemaObj;

      _this.dummy = new _this.Model({type: schema.type}, undefined, true);
      _this.dummy.form.save = __saveDummy.bind(_this.dummy);
      _this.allCollections[schema.type] = _this;

      _this.__synchronize('init');
    }

    function fromJson(json) {
      var _this = this;
      var collection = angular.fromJson(json);

      if (collection !== null && collection.data !== undefined) {
        _this.updatedAt = collection.updatedAt;

        angular.forEach(collection.data, function(objectData) {
          var data = objectData.data;
          _this.addOrUpdate(data, objectData.updatedAt);
        });
      }
    }

    function toJson() {
      var _this = this;
      var json = {
        data: {},
        updatedAt: _this.updatedAt
      };

      angular.forEach(_this.data, function(object, key) {
        json.data[key] = object.toJson();
      });

      return angular.toJson(json);
    }

    function addOrUpdate(validatedData, updatedAt) {
      var _this = this;
      if (validatedData.id === undefined) {
        $log.error('Can\'t add data without id!', validatedData);
        return;
      }

      if (_this.data[validatedData.id] === undefined) {
        _this.data[validatedData.id] = new this.Model(validatedData, updatedAt);
      } else {
        _this.data[validatedData.id].__setData(validatedData, updatedAt);
        _this.data[validatedData.id].__setLinks(validatedData.links);
      }

      _this.data[validatedData.id].__setUpdated(updatedAt);

      return _this.data[validatedData.id];
    }

    function __get(id) {
      var _this = this;

      if (_this.data[id] === undefined) {
        _this.data[id] = new _this.Model({id: id, type: _this.Model.prototype.schema.type}, undefined, true);
      }

      return _this.data[id];
    }

    function get(id) {
      var _this = this;
      var result;

      if (angular.isArray(id)) {
        result = [];
        angular.forEach(id, function(id) {
          result.push(_this.__get(id));
        });
      } else {
        result = _this.__get(id);
      }

      _this.__synchronize('get', result, undefined, undefined, _this.schema.params.get);

      return result;
    }

    function all() {
      var _this = this;

      _this.__synchronize('all', undefined, undefined, undefined, _this.schema.params.all);

      return _this.data;
    }

    function clear() {
      var _this = this;
      _this.updatedAt = Date.now();
      _this.data = {};

      _this.__synchronize('clear');
    }

    function __remove(id) {
      var _this = this;
      var object = _this.data[id];

      _this.removed[id] = object;
      _this.updatedAt = Date.now();

      delete _this.data[id];
    }

    function remove(id) {
      var _this = this;
      var object = _this.data[id];

      if (object !== undefined) {
        _this.__remove(id);
        object.__remove(id);
      } else {
        $log.error('Object with this id does not exist');
      }

      _this.__synchronize('remove', object);
    }

    function __saveDummy() {
      var _this = this;
      var errors = _this.form.validate();
      var newModel;

      if (angular.equals(errors, {})) {
        var data = angular.copy(_this.form.data);
        if (data.id === undefined) {
          data.id = uuid4.generate();
        } else if (!uuid4.validate(data.id)) {
          $log.error('Wrong id of dummy data!');
          return;
        }

        data.links = {};

        data.type = _this.schema.type;
        newModel = _this.parentCollection.addOrUpdate(data);
        _this.form.reset();
        _this.parentCollection.__synchronize('add', _this);
      }
    }

    function __synchronize(action, object, linkKey, linkedObject, params) {
      var _this = this;

      $log.log('Synchro Collection', this.Model.prototype.schema.type, {action: action, object: object, linkKey: linkKey, linkedObject: linkedObject, params: params});

      _this.synchronization.synchronize(action, _this, object, linkKey, linkedObject, params);
    }
  }
  AngularJsonAPICollectionWrapper.$inject = ["$log", "uuid4", "JsonAPIModelFactory", "AngularJsonAPISchema"];
})();

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPISchema', AngularJsonAPISchemaWrapper);

  function AngularJsonAPISchemaWrapper($log) {

    return AngularJsonAPISchema;

    function AngularJsonAPISchema(schema) {
      var _this = this;
      var include = [];

      _this.params = {
        get: {},
        all: {}
      };

      angular.forEach(schema.links, function(linkSchema, linkName) {
        var linkSchemaObj = new AngularJsonAPILinkSchema(linkSchema, linkName, schema.type);
        schema.links[linkName] = linkSchemaObj;
        if (linkSchemaObj.included === true) {
          include.push(linkName);
        }
      });

      angular.extend(_this, schema);

      if (include.length > 0) {
        _this.params.get.include = include.join(',');
      }
    }

    function AngularJsonAPILinkSchema(linkSchema, linkName, type) {
      var _this = this;

      if (angular.isString(linkSchema)) {
        _this.model = linkName;
        _this.type = linkSchema;
        _this.polymorphic = false;
        _this.reflection = type;
      } else {
        if (linkSchema.type === undefined) {
          $log.error('Schema of link without a type: ', linkSchema, linkName);
        }

        _this.model = linkSchema.model || linkName;
        _this.type = linkSchema.type;
        _this.polymorphic = linkSchema.polymorphic || false;
        _this.reflection = linkSchema.reflection || type;
        _this.included = linkSchema.included || false;
      }
    }

  }
  AngularJsonAPISchemaWrapper.$inject = ["$log"];
})();

/*jshint expr: true*/
'use strict';

describe('JsonAPIModelFactory factory', function() {
  var schema = {
    type: 'novels',
    id: 'uuid4',
    title: 'string',
    part: 'integer',
    links: {
      author: 'hasOne',
      dieties: 'hasMany'
    }
  };
  var linkGetters = {
    author: function(id) {
      return {id: id, name: 'Howard Phillips Lovecraft'};
    },

    dieties: function(ids) {
      return [{id: ids[0], name: 'Shub-Niggurath'}, {id: ids[1], name: 'Evil twins Nug and Yeb'}];
    }
  };
  var data = {
    type: 'novels',
    id: '975fe66c-43c6-46cb-98fe-1cac46370de2',
    title: 'An Epicure in the Terrible',
    part: 1,
    links: {
      self: 'http://example.com/novels/1',
      author: {
        self: 'http://example.com/novels/1/links/author',
        related: 'http://example.com/novels/1/author',
        linkage: { type: 'people', id: '873edec0-5266-463f-9fd4-24365637b4f4' }
      },
      dieties: {
        self: 'http://example.com/novels/1/links/dieties',
        related: 'http://example.com/novels/1/dieties',
        linkage: [
          { type: 'dieties', id: '0214cffb-3269-47df-a910-13088d3344cb' },
          { type: 'dieties', id: '1d75c7bc-4c4f-4923-98d4-a53caa137c09' }
        ]
      }
    }
  };

  beforeEach(module('angularJsonapi'));

  var Novel;
  var validNovel;
  var invalidNovel;

  beforeEach(inject(function(_JsonAPIModelFactory_) {
    var invalidData = angular.copy(data);
    Novel = _JsonAPIModelFactory_.model(schema, linkGetters).model;
    validNovel = new Novel(data);

    invalidData.id = 'adsad';
    invalidData.title = 34;
    invalidData.part = 'asdasd';
    invalidNovel = new Novel(invalidData);
  }));

  it('is ok', inject(function(JsonAPIModelFactory) {
    expect(JsonAPIModelFactory).to.be.ok;
    expect(Novel).to.be.ok;
    expect(Novel.prototype.schema).to.deep.equal(schema);
    expect(Novel.prototype.linkGetters).to.deep.equal(linkGetters);
  }));

  it('validates validNovel', function() {
    expect(validNovel.errors.title).to.be.empty;
    expect(validNovel.errors.part).to.be.empty;
  });

  it('produces errors for invalidNovel', function() {
    expect(invalidNovel.errors.validation.title).to.have.length(1);
    expect(invalidNovel.errors.validation.part).to.have.length(1);
    expect(invalidNovel.errors.validation.id).to.have.length(1);
  });

  it('set links for hasOne', function() {
    expect(validNovel.links.author('id')).to.deep.equal(linkGetters.author('873edec0-5266-463f-9fd4-24365637b4f4'));
  });

  it('set links for hasMany', function() {
    expect(validNovel.links.dieties()).to.deep.equal(linkGetters.dieties(['0214cffb-3269-47df-a910-13088d3344cb', '1d75c7bc-4c4f-4923-98d4-a53caa137c09']));
  });

  it('can be updated by valid form', function() {
    validNovel.form.data.title = 'New title';
    expect(validNovel.form.save()).to.be.fulfilled;
    expect(validNovel.data.title).to.equal('New title');
  });

  it('cannot be updated by invalid form', function() {
    validNovel.form.data.part = 'wrong';
    var promise = validNovel.form.save();
    expect(promise).to.be.rejected;
    expect(validNovel.data.part).to.equal(1);
  });
});

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('JsonAPIModelFactory', JsonAPIModelFactory);

  function JsonAPIModelFactory(AngularJsonAPIAbstractData, AngularJsonAPISchema, $log) {

    return {
      model: modelFactory
    };

    function modelFactory(schemaObj, linkedCollections, parentCollection) {
      var Model = function(data, updatedAt, dummy) {
        var _this = this;

        if (data.type !== _this.schema.type) {
          $log.error('Data type other then declared in schema: ', data.type, ' instead of ', _this.schema.type);
        }

        AngularJsonAPIAbstractData.call(_this, data, updatedAt, dummy);

        _this.form.parent = _this;
      };

      Model.prototype = Object.create(AngularJsonAPIAbstractData.prototype);
      Model.prototype.constructor = Model;

      Model.prototype.schema = schemaObj;
      Model.prototype.linkedCollections = linkedCollections;
      Model.prototype.parentCollection = parentCollection;

      angular.forEach(schemaObj.functions, function(metaFunction, metaFunctionName) {
        Model.prototype[metaFunctionName] = function() {
          return metaFunction.call(this);
        };
      });

      return Model;
    }

  }
  JsonAPIModelFactory.$inject = ["AngularJsonAPIAbstractData", "AngularJsonAPISchema", "$log"];
})();

/*jshint expr: true*/
'use strict';

describe('AngularJsonAPIAbstractData factory', function() {

});

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPIAbstractData', AngularJsonAPIAbstractDataWrapper);

  function AngularJsonAPIAbstractDataWrapper(
    $log,
    uuid4,
    lazyProperty,
    AngularJsonAPIAbstractDataForm
  ) {

    AngularJsonAPIAbstractData.prototype.__setData = __setData;
    AngularJsonAPIAbstractData.prototype.__setLinks   = __setLinks;
    AngularJsonAPIAbstractData.prototype.__setLink = __setLink;
    AngularJsonAPIAbstractData.prototype.__setAttributes = __setAttributes;
    AngularJsonAPIAbstractData.prototype.__validateData = __validateData;
    AngularJsonAPIAbstractData.prototype.__validateField = __validateField;
    AngularJsonAPIAbstractData.prototype.__updateAttributes = __updateAttributes;
    AngularJsonAPIAbstractData.prototype.__remove = __remove;
    AngularJsonAPIAbstractData.prototype.__setUpdated = __setUpdated;
    AngularJsonAPIAbstractData.prototype.__setLinkInternal = __setLinkInternal;

    AngularJsonAPIAbstractData.prototype.refresh = refresh;
    AngularJsonAPIAbstractData.prototype.remove = remove;
    AngularJsonAPIAbstractData.prototype.addLinkById = addLinkById;
    AngularJsonAPIAbstractData.prototype.addLink = addLink;
    AngularJsonAPIAbstractData.prototype.removeLink = removeLink;
    AngularJsonAPIAbstractData.prototype.toLink = toLink;
    AngularJsonAPIAbstractData.prototype.toPatchData = toPatchData;
    AngularJsonAPIAbstractData.prototype.removeAllLinks = removeAllLinks;

    AngularJsonAPIAbstractData.prototype.toJson = toJson;

    return AngularJsonAPIAbstractData;

    function AngularJsonAPIAbstractData(data, updatedAt, dummy) {
      var _this = this;

      data.links = data.links || {};

      _this.removed = false;
      _this.loadingCount = 0;
      _this.data = {
        links: {},
        attributes: {}
      };
      _this.links = {};

      _this.errors = {
        validation: {}
      };

      _this.dummy = dummy || false;
      _this.error = false;

      _this.__setUpdated(updatedAt);
      _this.__setData(data, updatedAt);

      _this.form = new AngularJsonAPIAbstractDataForm(_this);
    }

    function refresh() {
      var _this = this;

      _this.parentCollection.__synchronize('refresh', _this);
    }

    function toJson() {
      var _this = this;

      return {
        data: _this.data,
        updatedAt: _this.updatedAt
      };
    }

    function __setUpdated(updatedAt) {
      var _this = this;

      _this.updatedAt = updatedAt || Date.now();
      _this.parentCollection.updatedAt = _this.updatedAt;
    }

    function __remove() {
      var _this = this;

      _this.__setUpdated();
      _this.removed = true;
      _this.removeAllLinks();
    }

    function remove() {
      var _this = this;

      _this.__remove();
      _this.parentCollection.remove(_this.data.id);
    }

    function toLink() {
      return {type: this.data.type, id: this.data.id};
    }

    function toPatchData() {
      var _this = this;
      var res = {data: {}};
      angular.forEach(_this.data, function(val, key) {
        if (key !== 'links') {
          res.data[key] = val;
        }
      });

      return res;
    }

    function addLinkById(linkKey, linkModelName, id) {
      var _this = this;
      var linkedObject = _this.linkedCollections[linkModelName].__get(id);

      if (_this.schema.links[linkKey] === undefined) {
        $log.error('Cannot add link not specified in schema: ' + linkKey);
        return;
      }

      if (_this.linkedCollections[linkModelName] === undefined) {
        $log.error('Cannot add link of not existing type: ' + linkModelName);
        return;
      }

      if (!uuid4.validate(id)) {
        $log.error('Wrong link id, not uuid4: ' + id);
        return;
      }

      if (linkedObject === undefined) {
        $log.error('Cant find', linkModelName, 'with', id);
        return;
      }

      _this.addLink(
        linkKey,
        linkedObject
      );

    }

    function addLink(linkKey, linkedObject, reflection) {
      var _this = this;
      var linkSchema = _this.schema.links[linkKey];
      var linkType;
      var reflectionKey;
      var linkAttributes;

      if (linkedObject === undefined) {
        $log.error('Can\'t add non existing object');
        return;
      }

      if (linkSchema === undefined) {
        $log.error('Can\'t add link not present in schema: ', linkKey, _this, reflection);
        return;
      }

      if (linkSchema.polymorphic === false && linkSchema.model !== linkedObject.schema.type) {
        $log.error('This relation is not polymorphic, expected: ' + linkSchema.model + ' instead of ' + linkedObject.schema.type);
        return;
      }

      linkType = linkSchema.type;
      reflectionKey = linkSchema.reflection;
      linkAttributes = _this.data.links[linkKey].linkage;

      if (linkType === 'hasOne') {
        if (_this.data.links[linkKey].linkage.id === linkedObject.data.id) {
          return;
        }

        if (linkAttributes !== undefined && linkAttributes !== null) {
          $log.warn('Swaping hasOne', linkKey, 'of', _this.toString());
          _this.removeLink(linkKey);
        }

        _this.data.links[linkKey].linkage = linkedObject.toLink();
        linkAttributes = linkedObject.toLink();
      } else {
        var duplicate = false;
        angular.forEach(_this.data.links[linkKey].linkage, function(link) {
          if (link.id === linkedObject.data.id) {
            duplicate = true;
          }
        });

        if (duplicate === true) {
          return;
        }

        _this.data.links[linkKey].linkage.push(linkedObject.toLink());
      }

      if (reflection === true) {
        _this.parentCollection.__synchronize('addLinkReflection', _this, linkKey, linkedObject);
      } else {
        linkedObject.addLink(reflectionKey, _this, true);
        _this.parentCollection.__synchronize('addLink', _this, linkKey, linkedObject);
      }

      _this.__setUpdated();
      _this.__setLinkInternal(linkAttributes, linkKey, linkSchema);
    }

    function removeAllLinks() {
      var _this = this;

      angular.forEach(_this.links, function(link, key) {
        _this.removeLink(key);
      });
    }

    function removeLink(linkKey, linkedObject, reflection) {
      var _this = this;
      var linkSchema = _this.schema.links[linkKey];
      var linkType;
      var linkAttributes;
      var reflectionKey;
      var removed = false;

      if (_this.schema.links[linkKey] === undefined) {
        $log.error('Can\'t remove link not present in schema');
        return;
      }

      linkType = linkSchema.type;
      reflectionKey = linkSchema.reflection;
      linkAttributes = _this.data.links[linkKey].linkage;

      if (linkType === 'hasOne') {
        if (linkedObject === undefined || linkedObject.data.id === linkAttributes.id) {
          _this.data.links[linkKey].linkage = null;
          linkAttributes = null;
          removed = true;
          if (reflection !== true && _this.links[linkKey] !== undefined) {
            _this.links[linkKey].removeLink(reflectionKey, _this, true);
          }
        }
      } else {
        if (linkedObject === undefined) {
          _this.data.links[linkKey].linkage = [];
          linkAttributes = [];
          removed = true;
          if (reflection !== true) {
            angular.forEach(_this.links[linkKey], function(link) {
              link.removeLink(reflectionKey, _this, true);
            });
          }
        } else {
          angular.forEach(linkAttributes, function(link, index) {
            if (link.id === linkedObject.data.id) {
              if (reflection !== true) {
                linkedObject.removeLink(reflectionKey, _this, true);
              }

              linkAttributes.splice(index, 1);
              removed = true;
            }
          });
        }
      }

      if (removed === true) {
        _this.__setUpdated();

        if (reflection !== true) {
          _this.parentCollection.__synchronize('removeLink', _this, linkKey, linkedObject);
        } else {
          _this.parentCollection.__synchronize('removeLinkReflection',  _this, linkKey, linkedObject);
        }

        _this.__setLinkInternal(linkAttributes, linkKey, linkSchema);
      }
    }

    function __updateAttributes(validatedAttributes) {
      var _this = this;

      _this.__setUpdated();
      _this.__setAttributes(validatedAttributes);
      _this.parentCollection.__synchronize('update', _this);
    }

    function __setLinkInternal(linkAttributes, linkKey, linkSchema) {
      var _this = this;
      var linkType = linkSchema.type;
      var reflectionKey = linkSchema.reflection;

      if (linkAttributes === null) {
        delete _this.links[linkKey];
        _this.links[linkKey] = undefined;
      } else if (linkType === 'hasMany' && angular.isArray(linkAttributes)) {
        var getAll = function() {
          var result = [];
          angular.forEach(linkAttributes, function(link) {
            var linkedObject = _this.linkedCollections[link.type].__get(link.id);
            linkedObject.addLink(reflectionKey, _this, true);

            result.push(linkedObject);
          });

          return result;
        };

        lazyProperty(_this.links, linkKey, getAll);
      } else if (linkType === 'hasOne' && linkAttributes.id) {

        var getSingle = function() {
          var linkedObject = _this.linkedCollections[linkAttributes.type].__get(linkAttributes.id);
          linkedObject.addLink(reflectionKey, _this, true);

          return linkedObject;
        };

        lazyProperty(_this.links, linkKey, getSingle);
      }
    }

    function __setLink(linkAttributes, linkKey, linkSchema) {
      var _this = this;
      var linkType = linkSchema.type;
      var reflectionKey = linkSchema.reflection;

      if (linkType === 'hasMany' && angular.isArray(linkAttributes)) {
        var indexedLinks = {};
        angular.forEach(linkAttributes, function(link) {
          indexedLinks[link.id] = link;
        });

        angular.forEach(_this.links[linkKey], function(link) {
          if (indexedLinks[link.data.id] === undefined) {
            link.removeLink(reflectionKey, _this, true);
          }
        });
      } else if (linkType === 'hasOne' && linkAttributes.id) {
        if (_this.links[linkKey] !== undefined && _this.links[linkKey].data.id !== linkAttributes.id) {
          _this.links[linkKey].removeLink(reflectionKey, _this, true);
        }
      }

      _this.__setLinkInternal(linkAttributes, linkKey, linkSchema);
    }

    function __setLinks(links) {
      var _this = this;

      angular.forEach(_this.schema.links, function(linkSchema, linkName) {
        if (linkSchema.type === 'hasOne') {
          _this.data.links[linkName] = links[linkName] || {linkage: null};
        } else {
          _this.data.links[linkName] = links[linkName] || {linkage: []};
        }
      });

      angular.forEach(_this.schema.links, function(linkSchema, linkKey) {
        if (links[linkKey] !== undefined) {
          _this.__setLink(links[linkKey].linkage, linkKey, linkSchema);
        }
      });
    }

    function __validateField(data, key) {
      var _this = this;
      var error = [];

      if (data !== undefined) {
        error = __validate(_this.schema.attributes[key], data, key);
      }

      return error;
    }

    function __validateData(data) {
      var _this = this;
      var errors = {};

      angular.forEach(_this.schema.attributes, function(validator, key) {
        var error = _this.__validateField(data[key], key);
        if (error.length > 0) {
          errors[key] = error;
          $log.warn('Erorrs when validating ', data[key], errors);
        }
      });

      return errors;
    }

    function __setAttributes(attributes) {
      var _this = this;

      angular.forEach(_this.schema.attributes, function(validator, attributeName) {
        if (attributes[attributeName]) {
          _this.data.attributes[attributeName] = attributes[attributeName];
        }
      });
    }

    function __setData(data) {
      var _this = this;
      var safeData = angular.copy(data);

      _this.errors.validation = _this.__validateData(safeData);

      safeData.links = safeData.links || {};
      safeData.attributes = safeData.attributes || {};

      _this.data.id = safeData.id;
      _this.data.type = safeData.type;

      _this.__setAttributes(safeData.attributes);
      _this.__setLinks(safeData.links);
    }

    function __validate(validator, attributeValue, attributeName) {
      var errors = [];
      if (angular.isArray(validator)) {
        angular.forEach(validator, function(element) {
          errors = errors.concat(__validate(element, attributeValue, attributeName));
        });
      } else if (angular.isFunction(validator)) {
        var err = validator(attributeValue);
        if (angular.isArray(err)) {
          errors.concat(err);
        } else {
          $log.error(
            'Wrong validator type it should return array of errors instead of: ' +
              err.toString()
          );
        }
      } else if (angular.isString(validator)) {
        if (validator === 'text' || validator === 'string') {
          if (!angular.isString(attributeValue)) {
            errors.push(attributeName + ' is not a string ');
          }
        } else if (validator === 'number' || validator === 'integer') {
          if (parseInt(attributeValue).toString() !== attributeValue.toString()) {
            errors.push(attributeName + ' is not a number');
          }
        } else if (validator === 'uuid4') {
          if (!uuid4.validate(attributeValue)) {
            errors.push(attributeName + ' is not a uuid4');
          }
        } else if (validator === 'required') {
          if (attributeValue.toString().length === 0) {
            errors.push(attributeName + ' is empty');
          }
        } else {
          $log.error('Wrong validator type: ' + validator.toString());
        }
      } else if (angular.isObject(validator)) {
        if (validator.maxlength !== undefined && attributeValue.length > validator.maxlength) {
          errors.push(attributeName + ' is too long max ' + validator.maxlength);
        }

        if (validator.minlength !== undefined && attributeValue.length < validator.minlength) {
          errors.push(attributeName + ' is too short min ' + validator.minlength);
        }

        if (validator.maxvalue !== undefined && parseInt(attributeValue) > validator.maxvalue) {
          errors.push(attributeName + ' is too big max ' + validator.maxvalue);
        }

        if (validator.minvalue !== undefined && parseInt(attributeValue) < validator.minvalue) {
          errors.push(attributeName + ' is too small min ' + validator.minvalue);
        }
      } else {
        $log.error('Wrong validator type: ' + validator.toString());
      }

      return errors;
    }

  }
  AngularJsonAPIAbstractDataWrapper.$inject = ["$log", "uuid4", "lazyProperty", "AngularJsonAPIAbstractDataForm"];
})();

/*jshint expr: true*/
'use strict';

describe('AngularJsonAPIAbstractDataForm factory', function() {

});

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .factory('AngularJsonAPIAbstractDataForm', AngularJsonAPIAbstractDataFormWrapper);

  function AngularJsonAPIAbstractDataFormWrapper($log) {

    AngularJsonAPIAbstractDataForm.prototype.save = save;
    AngularJsonAPIAbstractDataForm.prototype.reset = reset;
    AngularJsonAPIAbstractDataForm.prototype.validate = validate;
    AngularJsonAPIAbstractDataForm.prototype.validateField = validateField;

    AngularJsonAPIAbstractDataForm.prototype.__synchronize = __synchronize;

    return AngularJsonAPIAbstractDataForm;

    function AngularJsonAPIAbstractDataForm(parent) {
      var _this = this;

      _this.data = {};
      _this.parent = parent;
      _this.reset();
    }

    function save() {
      var _this = this;
      var errors = _this.validate();

      if (angular.equals(errors, {}) === false) {
        $log.error('Errors in form: ', errors);
        return;
      }

      _this.parent.__updateAttributes(_this.data);
    }

    function reset() {
      var _this = this;

      angular.forEach(_this.parent.schema.attributes, function(data, key) {
        _this.data[key] = _this.parent.data.attributes[key] || '';
      });

      _this.errors = {
        validation: {}
      };
    }

    function validate() {
      var _this = this;
      var errors;

      errors = _this.parent.__validateData(_this.data);

      _this.errors.validation = errors;

      return errors;
    }

    function validateField(key) {
      var _this = this;
      var errors;
      errors = _this.parent.__validateField(
        _this.data[key],
        key
      );

      _this.errors.validation[key] = errors;

      return errors;
    }

    function __synchronize(key) {
      $log.log('Synchro Collection ' + this.Model.prototype.schema.type, key);
    }

  }
  AngularJsonAPIAbstractDataFormWrapper.$inject = ["$log"];
})();

/*jshint expr: true*/
'use strict';

describe('$jsonapi provider', function() {

  beforeEach(module('angularJsonapi'));

  it('returns valid model', inject(function($jsonapi) {
    expect($jsonapi).to.be.ok;
  }));

});

(function() {
  'use strict';

  angular.module('angularJsonapi')
  .provider('$jsonapi', jsonapiProvider);

  function jsonapiProvider() {
    var memory = {};
    this.$get = jsonapiFactory;

    function jsonapiFactory($log, AngularJsonAPICollection) {
      return {
        form: form,
        get: get,
        remove: remove,
        all: all,
        addModel: addModel,
        getModel: getModel
      };

      function addModel(schema, synchronization) {
        var collection = new AngularJsonAPICollection(schema, synchronization);

        memory[schema.type] = collection;
      }

      function getModel(type) {
        return memory[type];
      }

      function form(type) {
        if (memory[type] === undefined) {
          $log.error('Can\t add not existing object type: ' + type + '. Use initialize(Model, datas).');
        }

        return memory[type].dummy.form;
      }

      function get(type, id) {
        if (memory[type] === undefined) {
          $log.error('Can\t get not existing object type: ' + type + '. Use initialize(Model, datas).');
        }

        return memory[type].get(id);
      }

      function remove(type, id) {
        if (memory[type] === undefined) {
          $log.error('Can\t remove not existing object type: ' + type + '. Use initialize(Model, datas).');
        }

        return memory[type].remove(id);
      }

      function all(type) {
        if (memory[type] === undefined) {
          $log.error('Can\t get all of not existing object type: ' + type + '. Use initialize(Model, datas).');
        }

        return memory[type].all();
      }
    }
    jsonapiFactory.$inject = ["$log", "AngularJsonAPICollection"];
  }

})();


//# sourceMappingURL=angular-jsonapi.js.map